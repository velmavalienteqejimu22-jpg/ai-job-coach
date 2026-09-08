import {GET,POST} from "./route";
import {getCurrentUserFromRequest} from "@/lib/auth";
import {getDbClient} from "@/lib/db";
import {callLLM} from "@/lib/llm";
jest.mock("@/lib/auth");
jest.mock("@/lib/db");
jest.mock("@/lib/llm");
jest.mock("@/lib/metered-ai-route",()=>({withMeteredAiRoute:(handler:unknown)=>handler}));
jest.mock("@/lib/coach-harness/repository");
describe("agent boundary",()=>{
 beforeEach(()=>jest.resetAllMocks());
 test("unauthenticated history is denied",async()=>{expect((await GET(new Request("https://example.com/api/coach/agent"))).status).toBe(401);expect(getDbClient).not.toHaveBeenCalled();});
 test("malformed scope rejected",async()=>{(getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:"user"});expect((await GET(new Request("https://example.com/api/coach/agent?opportunityId=wrong"))).status).toBe(400);expect(getDbClient).not.toHaveBeenCalled();});
 test("empty submission rejected before database",async()=>{(getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:"user"});expect((await POST(new Request("https://example.com/api/coach/agent",{method:"POST",body:JSON.stringify({message:""})}))).status).toBe(400);expect(getDbClient).not.toHaveBeenCalled();});
 test("history is owner and scope filtered and uncached",async()=>{
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:"owner"});
  const q={select:jest.fn().mockReturnThis(),eq:jest.fn().mockReturnThis(),is:jest.fn().mockReturnThis(),order:jest.fn().mockReturnThis(),limit:jest.fn().mockResolvedValue({data:[],error:null})};
  (getDbClient as jest.Mock).mockResolvedValue({from:()=>q});
  const res=await GET(new Request("https://example.com/api/coach/agent"));expect(q.eq).toHaveBeenCalledWith("user_id","owner");expect(q.is).toHaveBeenCalledWith("opportunity_id",null);expect(res.headers.get("cache-control")).toContain("no-store");
 });
 test("retry reuses the persisted answer without another model call",async()=>{
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:"owner"});
  const q={select:jest.fn().mockReturnThis(),eq:jest.fn().mockReturnThis(),maybeSingle:jest.fn().mockResolvedValue({data:{id:"saved",answer:"已保存回复",opportunity_id:null},error:null})};
  (getDbClient as jest.Mock).mockResolvedValue({from:()=>q});
  const res=await POST(new Request("https://example.com/api/coach/agent",{method:"POST",body:JSON.stringify({message:"重试",requestId:"11111111-1111-4111-8111-111111111111"})}));
  expect(res.status).toBe(200);expect((await res.json()).answer).toBe("已保存回复");expect(callLLM).not.toHaveBeenCalled();expect(q.eq).toHaveBeenCalledWith("user_id","owner");
 });
 test("a request id cannot reuse another opportunity's answer",async()=>{
  (getCurrentUserFromRequest as jest.Mock).mockResolvedValue({id:"owner"});
  const q={select:jest.fn().mockReturnThis(),eq:jest.fn().mockReturnThis(),maybeSingle:jest.fn().mockResolvedValue({data:{id:"saved",answer:"private",opportunity_id:"22222222-2222-4222-8222-222222222222"},error:null})};
  (getDbClient as jest.Mock).mockResolvedValue({from:()=>q});
  const res=await POST(new Request("https://example.com/api/coach/agent",{method:"POST",body:JSON.stringify({message:"重试",requestId:"11111111-1111-4111-8111-111111111111"})}));
  expect(res.status).toBe(409);expect((await res.json()).answer).toBeUndefined();expect(callLLM).not.toHaveBeenCalled();
 });
});

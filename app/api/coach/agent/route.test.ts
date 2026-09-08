import {GET,POST} from "./route";
import {getCurrentUserFromRequest} from "@/lib/auth";
import {getDbClient} from "@/lib/db";
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
});

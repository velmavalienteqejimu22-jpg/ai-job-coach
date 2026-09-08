import {GET} from "./route";
import {getDbClient} from "@/lib/db";
jest.mock("@/lib/db");
describe("research heartbeat",()=>{
 const original=process.env.CRON_SECRET;
 afterEach(()=>{if(original===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=original;jest.resetAllMocks();});
 test("missing configuration fails closed",async()=>{delete process.env.CRON_SECRET;expect((await GET(new Request("https://example.com",{headers:{authorization:"Bearer undefined"}}))).status).toBe(401);expect(getDbClient).not.toHaveBeenCalled();});
 test("wrong secret rejected",async()=>{process.env.CRON_SECRET="test-only";expect((await GET(new Request("https://example.com",{headers:{authorization:"Bearer wrong"}}))).status).toBe(401);});
});

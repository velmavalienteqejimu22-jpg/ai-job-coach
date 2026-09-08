import { createHash, timingSafeEqual } from "node:crypto";
import { getDbClient } from "@/lib/db";
export const runtime="nodejs";
export const maxDuration=60;
// Fixed public sources only: no user URLs, credentials, redirects or private materials.
const sources=[
 {url:"https://www.stats.gov.cn/sj/zxfb/",region:"CN：国家统计局最新发布，仅就业相关文章适用"},
 {url:"https://www.bls.gov/news.release/empsit.nr0.htm",region:"US：BLS 就业报告，不代表中国就业情况"},
];
export async function GET(req:Request){
 const secret=process.env.CRON_SECRET;
 const supplied=Buffer.from(req.headers.get("authorization")||"");
 const expected=Buffer.from(`Bearer ${secret||""}`);
 if(!secret||supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return Response.json({error:"Unauthorized"},{status:401});
 const db=await getDbClient();if(!db)return Response.json({error:"Database unavailable"},{status:503});
 const results=[];
 for(const source of sources){
  try{
   const {data:old,error:readError}=await db.from("coach_market_updates").select("content_hash,checked_at,changed_at").eq("source_url",source.url).maybeSingle();
   if(readError)throw readError;
   if(old&&Date.now()-Date.parse(old.checked_at)<20*60*60*1000){results.push({url:source.url,status:"cached"});continue;}
   const response=await fetch(source.url,{redirect:"error",signal:AbortSignal.timeout(12000),headers:{"User-Agent":"YiZhiResearch/0.1"},cache:"no-store"});
   if(!response.ok||!response.body)throw Error("Source unavailable");
   const reader=response.body.getReader();let bytes=0;const chunks:Uint8Array[]=[];
   while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>600000){await reader.cancel();throw Error("Source too large");}chunks.push(value);}
   const raw=Buffer.concat(chunks).toString("utf8");
   const text=raw.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi,"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim();
   if(text.length<200)throw Error("Source incomplete");
   const excerpt=text.slice(0,6000),hash=createHash("sha256").update(excerpt).digest("hex"),now=new Date().toISOString();
   const {error}=await db.from("coach_market_updates").upsert({source_url:source.url,region:source.region,content_hash:hash,excerpt,checked_at:now,changed_at:old?.content_hash===hash?old.changed_at:now});
   if(error)throw error;
   results.push({url:source.url,status:old?.content_hash===hash?"unchanged":"updated"});
  }catch{results.push({url:source.url,status:"failed"});}
 }
 return Response.json({ok:!results.some(r=>r.status==="failed"),results},{status:results.every(r=>r.status==="failed")?502:200});
}

"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./AgentConversation.module.css";
type Turn = {id:string;question:string;answer:string};
export default function AgentConversation({ opportunityId, label, enabled=true }: {opportunityId?:string;label:string;enabled?:boolean}) {
  const [turns,setTurns] = useState<Turn[]>([]);
  const [message,setMessage] = useState("");
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(true);
  const generation = useRef(0);
  useEffect(() => {
    const token=++generation.current;
    setTurns([]);setMessage("");setError("");setBusy(false);setLoading(true);
    if (!enabled) {setLoading(false);return;}
    fetch(`/api/coach/agent${opportunityId?`?opportunityId=${opportunityId}`:""}`,{cache:"no-store"})
      .then(r=>r.json()).then(b=>{if(token!==generation.current)return;if(b.ok)setTurns(b.turns);else setError(b.error||"读取失败");})
      .catch(()=>{if(token===generation.current)setError("网络异常，暂时无法读取历史");})
      .finally(()=>{if(token===generation.current)setLoading(false);});
    return ()=>{generation.current=token+1;};
  },[opportunityId,enabled]);
  async function send() {
    if(busy||!message.trim()||!enabled)return;
    const token=generation.current, question=message.trim(),requestId=crypto.randomUUID();
    setBusy(true);setError("");
    try {
      const response=await fetch("/api/coach/agent",{method:"POST",headers:{"Content-Type":"application/json","x-idempotency-key":requestId},body:JSON.stringify({opportunityId,message:question,requestId})});
      const body=await response.json();
      if(token!==generation.current)return;
      if(!body.ok)throw new Error(body.error||"回答暂时不可用");
      setTurns(t=>[...t,{id:body.id,question,answer:body.answer}]);setMessage("");
    }catch(e){if(token===generation.current)setError(e instanceof Error?e.message:"网络异常，请先核对历史再重试");}
    finally{if(token===generation.current)setBusy(false);}
  }
  return <section className={styles.panel} aria-label="导师对话">
    <header><strong>和导师聊聊</strong><span>共享当前上下文</span></header>
    <p className={styles.context}>{label} · 已保存材料按需读取</p>
    <div className={styles.messages} aria-live="polite">
      {loading?<p>正在找回对话…</p>:!turns.length?<p>{enabled?"不用重新解释。可以问：我现在最该补什么？":"示例模式不会调用模型；登录并保存岗位后即可对话。"}</p>:turns.map(t=><div key={t.id}><p className={styles.question}>{t.question}</p><p className={styles.answer}>{t.answer}</p></div>)}
      {busy&&<p>正在结合材料思考…</p>}
    </div>
    {error&&<p role="alert" className={styles.error}>{error}</p>}
    <form onSubmit={e=>{e.preventDefault();void send();}}>
      <textarea aria-label="给导师的消息" placeholder="聊聊你现在卡住的地方…" rows={3} maxLength={4000} disabled={!enabled} value={message} onChange={e=>setMessage(e.target.value)}/>
      <footer><small>只读工作区 · 使用 AI 对话额度</small><button disabled={busy||loading||!enabled||!message.trim()} type="submit">{busy?"思考中":"发送 ↑"}</button></footer>
    </form>
  </section>;
}

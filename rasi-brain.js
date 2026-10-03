/* RĀSI brain — AI-first chat
   The client does NOT classify messages with keywords or modes.
   Every message is sent to the AI with the last 15 messages + current schedule.
*/
(() => {
  "use strict";

  const VERSION = "brain-v7.0-ai-first";
  const CONFIG = window.RASI_CONFIG || {};
  function endpoint(){ return CONFIG.aiEndpoint || localStorage.getItem("rasiAiEndpoint") || ""; }

  function stateRef(){
    // index.html keeps `state` as a lexical variable, not window.state.
    // Use the runtime bridge so chat writes reach the real app state.
    return window.RASI_RUNTIME?.getState?.() || window.state || null;
  }
  function safeState(){ return stateRef() || {}; }
  function norm(v){ return String(v ?? "").trim(); }

  function scheduleSnapshot(){
    const s = safeState();
    const selected = window.__selectedDate || new Date();
    let tasks = [];
    try {
      tasks = typeof todayTasks === "function" ? todayTasks().map(t => ({
        id:t.id, name:t.n, start:t.s, end:t.e, category:t.cat,
        done:!!t.done, locked:t.cat==="college"
      })) : [];
    } catch (_) {}

    const date = typeof dateKey === "function"
      ? dateKey(selected)
      : selected.toISOString().slice(0,10);

    return {
      date,
      weekday: typeof DAY_NAME === "function" ? DAY_NAME(selected.getDay()) : selected.toLocaleDateString([], {weekday:"long"}),
      collegeEnabled: typeof collegeEnabledForDate === "function" ? collegeEnabledForDate(selected) : true,
      tasks,
      reminders: Array.isArray(s.reminders) ? s.reminders.slice(-20) : []
    };
  }

  function memoryContext(query){
    // Local retrieval only: no extra API call and no change to app state.
    // Search saved conversations on-device and return only the most relevant snippets.
    const s=safeState();
    const conversations=Array.isArray(s.conversations) ? s.conversations : [];
    const qTokens=norm(query).toLowerCase().match(/[a-z0-9']{3,}/g)||[];
    const stop=new Set(["the","and","for","that","this","with","you","are","was","but","have","what","how","can","from","about","just","not","your","they","them","then","than","into","want","need","like","really","when","where","why","who"]);
    const q=new Set(qTokens.filter(t=>!stop.has(t)));
    if(!q.size || !conversations.length) return "";
    const hits=[];
    for(const convo of conversations){
      const msgs=Array.isArray(convo?.messages) ? convo.messages : [];
      for(let i=0;i<msgs.length;i++){
        const m=msgs[i];
        if(m?.who!=="you") continue;
        const text=norm(m.text);
        const tokens=text.toLowerCase().match(/[a-z0-9']{3,}/g)||[];
        const overlap=tokens.filter(t=>q.has(t)).length;
        if(!overlap) continue;
        const unique=new Set(tokens).size||1;
        const score=(overlap/Math.sqrt(q.size*unique))*100 + (String(convo.updatedAt||"").localeCompare("1970")/1e20);
        const before=msgs[i-1]?.who==="rasi" ? norm(msgs[i-1].text) : "";
        const after=msgs[i+1]?.who==="rasi" ? norm(msgs[i+1].text) : "";
        hits.push({score,text,before,after,date:convo.updatedAt||"",title:convo.title||"Previous chat"});
      }
    }
    hits.sort((a,b)=>b.score-a.score);
    const chosen=[];
    const seen=new Set();
    for(const h of hits){
      const key=h.text.toLowerCase().slice(0,180);
      if(seen.has(key)) continue;
      seen.add(key);
      chosen.push(h);
      if(chosen.length>=6) break;
    }
    if(!chosen.length) return "";
    return chosen.map((h,i)=>{
      const date=h.date ? new Date(h.date).toLocaleDateString([], {day:"numeric",month:"short",year:"numeric"}) : "unknown date";
      return "[Memory "+(i+1)+" | "+date+" | "+h.title+"]\\nUser: "+h.text+(h.before?"\\nRĀSI: "+h.before:"")+(h.after?"\\nRĀSI: "+h.after:"");
    }).join("\\n\\n").slice(0,7000);
  }

  function last15(){
    const chat = Array.isArray(safeState().chat) ? safeState().chat : [];
    return chat.slice(-15).map(m => ({
      role: m.who === "you" ? "user" : "assistant",
      content: norm(m.text)
    }));
  }

  function setTyping(on){
    const box=document.getElementById("chat");
    if(!box)return;
    const thread=box.querySelector(".chat-thread");
    if(!thread)return;
    let el=thread.querySelector(".rasi-typing");
    if(on){
      if(!el){
        el=document.createElement("div");
        el.className="buddy-msg rasi rasi-typing";
        el.innerHTML='<span class="chat-who">RĀSI</span><span class="typing-dots"><i></i><i></i><i></i></span>';
        thread.appendChild(el);
      }
      thread.scrollTop=thread.scrollHeight;
    }else if(el)el.remove();
  }

  function persist(){
    try{
      if(typeof persistCurrentChat === "function") persistCurrentChat();
      if(typeof save === "function") save();
    }catch(_){}
  }

  function showChatError(message){
    const s=safeState();
    if(!Array.isArray(s.chat))s.chat=[];
    s.chat.push({who:"rasi",text:message});
    persist();
    if(typeof renderChat === "function")renderChat();
    requestAnimationFrame(()=>{
      const t=document.querySelector(".chat-thread");
      if(t)t.scrollTop=t.scrollHeight;
    });
  }

  function parseModelResponse(data){
    if(!data || typeof data !== "object") throw new Error("Invalid AI response");
    const result=data.result || data.output || data;
    if(typeof result.reply === "string"){
      return {reply:result.reply,action:result.action===null?null:result.action};
    }
    if(typeof data.output_text === "string"){
      const parsed=JSON.parse(data.output_text);
      return {reply:norm(parsed.reply),action:parsed.action===null?null:parsed.action};
    }
    throw new Error("AI returned no reply");
  }

  function rawCurrentMessage(history){
    const last=Array.isArray(history) ? history[history.length-1] : null;
    return norm(last?.content || "");
  }

  async function askAI(){
    const ENDPOINT = endpoint();
    if(!ENDPOINT) throw new Error("RĀSI AI is not connected yet. Add the secure AI endpoint in RĀSI settings.");

    const payload={
      messages:last15(),
      currentMessage:last15().at(-1)?.content || "",
      schedule:scheduleSnapshot(),
      memory_context:memoryContext(rawCurrentMessage(last15())),
      instruction:"Use memory_context only as relevant prior conversation evidence. Do not claim a memory is true if it is not supported by the supplied context. Decide from the conversation itself whether the user is chatting or asking RĀSI to change the app. Do not use client-side keywords, modes, or hard-coded intent rules."
    };

    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),30000);
    try{
      const response=await fetch(ENDPOINT,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(payload),
        signal:controller.signal
      });
      let data=null;
      try{data=await response.json();}catch(_){}
      if(!response.ok){
        const detail=data?.error || ("HTTP "+response.status);
        throw new Error(detail);
      }
      return parseModelResponse(data);
    }finally{
      clearTimeout(timer);
    }
  }

  function asDate(value){
    const s=norm(value);
    if(!s)return new Date(window.__selectedDate || new Date());
    if(/^\d{4}-\d{2}-\d{2}$/.test(s)){
      const d=new Date(s+"T12:00:00");
      if(!Number.isNaN(d.getTime()))return d;
    }
    const base=new Date();
    base.setHours(12,0,0,0);
    if(/^today$/i.test(s))return base;
    if(/^tomorrow$/i.test(s)){base.setDate(base.getDate()+1);return base;}
    if(/^day after tomorrow$/i.test(s)){base.setDate(base.getDate()+2);return base;}
    return new Date(window.__selectedDate || new Date());
  }

  function getTasksFor(d){
    return typeof tasksForDate==="function" ? tasksForDate(d) : [];
  }

  function timeMinutes(v){
    try{return typeof minutes==="function" ? minutes(v) : NaN;}catch(_){return NaN;}
  }

  function sortTasks(arr){
    arr.sort((a,b)=>timeMinutes(a.s)-timeMinutes(b.s));
    arr.forEach((t,i)=>t.order=i);
  }

  function applyAction(action){
    if(!action || typeof action!=="object")return null;
    const s=safeState();
    const type=norm(action.type).toLowerCase();
    const d=asDate(action.details?.date);
    const key=typeof dateKey==="function" ? dateKey(d) : d.toISOString().slice(0,10);
    const details=action.details || {};
    s.dateTasks=s.dateTasks||{};

    if(type==="toggle_college" || type==="set_college"){
      const enabled=details.enabled !== false;
      s.collegeOffDates=s.collegeOffDates||{};
      if(enabled)delete s.collegeOffDates[key];
      else s.collegeOffDates[key]=true;
      return enabled ? "College blocks restored." : "College blocks hidden for that date.";
    }

    const arr=getTasksFor(d);
    const find=()=>{
      if(details.taskId){
        const byId=arr.find(t=>t.id===details.taskId);
        if(byId)return byId;
      }
      const wanted=norm(details.name||details.taskName).toLowerCase();
      if(wanted)return arr.find(t=>norm(t.n).toLowerCase()===wanted) || arr.find(t=>norm(t.n).toLowerCase().includes(wanted));
      return null;
    };

    if(type==="add_task"){
      const name=norm(details.name||details.taskName);
      const start=norm(details.start);
      const end=norm(details.end);
      if(!name || !start || !end)throw new Error("AI action was missing task name or time.");
      arr.push({
        id:typeof uid==="function"?uid():("ai-"+Date.now()),
        s:start.toUpperCase(),e:end.toUpperCase(),n:name,
        cat:norm(details.category||"life").toLowerCase(),
        info:norm(details.info||"Added by RĀSI at your request."),
        done:false,order:arr.length
      });
      sortTasks(arr);
      return "Added “"+name+"”.";
    }

    if(type==="delete_task" || type==="remove_task"){
      const t=find();
      if(!t)throw new Error("I couldn't find the task RĀSI tried to remove.");
      s.dateTasks[key]=arr.filter(x=>x.id!==t.id);
      sortTasks(s.dateTasks[key]);
      return "Removed “"+t.n+"”.";
    }

    if(type==="complete_task" || type==="mark_complete"){
      const t=find();
      if(!t)throw new Error("I couldn't find the task RĀSI tried to complete.");
      t.done=true;
      return "Marked “"+t.n+"” complete.";
    }

    if(type==="edit_task" || type==="move_task" || type==="reschedule_task"){
      const t=find();
      if(!t)throw new Error("I couldn't find the task RĀSI tried to change.");
      if(details.name && type==="edit_task")t.n=details.name;
      if(details.category)t.cat=details.category;
      if(details.info)t.info=details.info;
      if(details.start)t.s=String(details.start).toUpperCase();
      if(details.end)t.e=String(details.end).toUpperCase();
      if(!details.end && details.start && type!=="edit_task"){
        const oldStart=timeMinutes(t.s),oldEnd=timeMinutes(t.e),newStart=timeMinutes(String(details.start).toUpperCase());
        if(Number.isFinite(oldStart)&&Number.isFinite(oldEnd)&&Number.isFinite(newStart)){
          const dur=oldEnd-oldStart;
          const endTotal=newStart+dur, h=Math.floor(endTotal/60)%24,m=endTotal%60;
          const ap=h>=12?"PM":"AM",hh=h%12||12;
          t.e=String(hh).padStart(2,"0")+":"+String(m).padStart(2,"0")+" "+ap;
        }
      }
      sortTasks(arr);
      return "Updated “"+t.n+"”.";
    }

    if(type==="reorder_task"){
      const t=find();
      if(!t)throw new Error("I couldn't find the task RĀSI tried to reorder.");
      const direction=String(details.direction||"").toLowerCase();
      const ordered=arr.slice().sort((a,b)=>a.order-b.order);
      const i=ordered.findIndex(x=>x.id===t.id);
      const j=direction==="up"||direction==="earlier" ? i-1 : i+1;
      if(i<0||j<0||j>=ordered.length) return "That task is already at the edge of the schedule.";
      [ordered[i].order,ordered[j].order]=[ordered[j].order,ordered[i].order];
      ordered.forEach((x,n)=>x.order=n);
      return "Reordered “"+t.n+"”.";
    }

    throw new Error("RĀSI returned an unsupported action: "+type);
  }

  async function brainCommand(){
    const input=document.getElementById("buddyInput");
    const raw=norm(input?.value);
    if(!raw)return;
    input.value="";
    const s=safeState();
    if(!Array.isArray(s.chat))s.chat=[];
    s.chat.push({who:"you",text:raw});
    persist();
    if(typeof renderChat==="function")renderChat(true);
    setTyping(true);

    try{
      const result=await askAI();
      let actionNote="";
      if(result.action!==null){
        actionNote=applyAction(result.action) || "";
        if(typeof saveRender==="function")saveRender();
        else {persist();if(typeof render==="function")render();}
      }
      setTyping(false);
      s.chat.push({who:"rasi",text:norm(result.reply)+(actionNote ? "\n\n✓ "+actionNote : "")});
      persist();
      if(typeof renderChat==="function")renderChat(true);
      requestAnimationFrame(()=>{
        const t=document.querySelector(".chat-thread");
        if(t)t.scrollTop=t.scrollHeight;
      });
    }catch(err){
      console.error("RĀSI AI request failed",err);
      setTyping(false);
      showChatError("RĀSI couldn't reach her AI right now. Your message was not used to change the schedule. Check the AI connection and try again.");
    }
  }

  window.buddyCommand=brainCommand;
  const chatInput=document.getElementById("buddyInput");
  if(chatInput){
    chatInput.addEventListener("keydown",event=>{
      if(event.key==="Enter" && !event.shiftKey){
        event.preventDefault();
        brainCommand();
      }
    });
    chatInput.addEventListener("input",()=>{
      chatInput.style.height="auto";
      chatInput.style.height=Math.min(chatInput.scrollHeight,140)+"px";
    });
  }
  window.RASI_BRAIN={
    version:VERSION,
    scheduleSnapshot,
    last15,
    askAI,
    applyAction
  };
})();

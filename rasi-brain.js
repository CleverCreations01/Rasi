/* RĀSI Brain v1 — private prototype brain layer.
   No secrets live here. A future secure backend can be connected through RASI_AI_ENDPOINT.
*/
(() => {
  "use strict";
  const VERSION = "brain-v5.0";
  const CONFIG = window.RASI_CONFIG || {};
  const ENDPOINT = CONFIG.aiEndpoint || "";
  const MAX_CONTEXT_MESSAGES = 16;
  const EMOJIS = ["✨","👀","😭","😂","🫶","💀","🤨","😌","🔥","🌱","🧠","🙃"];

  const safeState = () => (window.RASI_RUNTIME && window.RASI_RUNTIME.getState) ? window.RASI_RUNTIME.getState() : {};
  const pick = (arr) => arr[Math.floor(Math.random()*arr.length)];
  const norm = s => String(s||"").trim();
  const lower = s => norm(s).toLowerCase();

  function remember(text, kind="context"){
    const s=safeState();
    if(!s.rasiMemory) s.rasiMemory=[];
    const t=norm(text);
    if(!t) return;
    const entry=t.length>220?t.slice(0,217)+"...":t;
    s.rasiMemory=[entry,...s.rasiMemory.filter(x=>x!==entry)].slice(0,30);
    if(!s.rasiBrain) s.rasiBrain={version:VERSION,mode:null,profile:{},pending:null};
    s.rasiBrain.updatedAt=new Date().toISOString();
    s.rasiBrain.profile.lastMemoryKind=kind;
  }

  function ensureBrain(){
    const s=safeState();
    if(!s.rasiBrain || typeof s.rasiBrain!=="object") s.rasiBrain={version:VERSION,mode:null,profile:{},pending:null};
    s.rasiBrain.version=VERSION;
    if(!s.rasiBrain.profile) s.rasiBrain.profile={};
    if(!Array.isArray(s.rasiMemory)) s.rasiMemory=[];
    return s.rasiBrain;
  }

  function taskSummary(){
    try{
      const tasks=(typeof todayTasks==="function"?todayTasks():[])||[];
      const open=tasks.filter(t=>!t.done);
      return {
        total:tasks.length,
        done:tasks.filter(t=>t.done).length,
        next:open.filter(t=>t.cat!=="college")[0]?.n||null,
        nextTime:open.filter(t=>t.cat!=="college")[0]?.s||null,
        names:open.slice(0,8).map(t=>t.n)
      };
    }catch(e){return {total:0,done:0,next:null,nextTime:null,names:[]};}
  }

  function context(){
    const s=safeState();
    const brain=ensureBrain();
    const ts=taskSummary();
    return {
      assistantName:s.buddyName||s.appName||"RĀSI",
      date:typeof day!=="undefined"?day:"",
      selectedDate:typeof window.__selectedDate!=="undefined"?window.__selectedDate:null,
      tasks:ts,
      memories:(s.rasiMemory||[]).slice(0,16),
      brainProfile:brain.profile||{},
      pending:brain.pending||null,
      skin:s.skin||"midnight",
      body:{day:s.bodyDay||1,mode:s.bodyMode||"normal"},
      recentChat:(s.chat||[]).slice(-MAX_CONTEXT_MESSAGES).map(m=>({who:m.who,text:m.text}))
    };
  }

  function saveRender(){
    try{
      if(window.RASI_RUNTIME?.save) window.RASI_RUNTIME.save();
      else if(typeof save==="function") save();
      if(window.RASI_RUNTIME?.render) window.RASI_RUNTIME.render();
      else if(typeof render==="function") render();
    }catch(e){}
  }

  function pushReply(reply){
    const s=safeState();
    if(!Array.isArray(s.chat)) s.chat=[];
    s.chat.push({who:"nova",text:reply});
    s.chatOpen=true;
    saveRender();
    if(typeof showToast==="function") showToast("RĀSI is thinking ✦");
  }

  function rememberUser(raw){
    const s=safeState(), x=lower(raw);
    const useful=/\b(i (am|work|study|live|want|need|prefer|like|hate|love|usually|always|never|can|can't|cannot))\b/.test(x) ||
      /\b(my (goal|routine|college|school|job|work|schedule|preference|project|plan|name|friend|family))\b/.test(x);
    if(!useful)return;
    remember(raw,"user-fact");
    const brain=ensureBrain(), p=brain.profile;
    const groups=[
      ["preferences",/\b(i prefer|i like|i love|i hate|i don't like|i dont like)\b/],
      ["goals",/\b(my goal|i want to|i wanna|i need to)\b/],
      ["constraints",/\b(i can't|i cannot|i dont have|i don't have|only have|can't afford)\b/],
      ["routine",/\b(i usually|i always|my routine|my schedule|i wake|i sleep)\b/],
      ["context",/\b(college|pg|hostel|family|friend|work|project)\b/]
    ];
    groups.forEach(([key,re])=>{
      if(re.test(x)){p[key]=Array.isArray(p[key])?p[key]:[];p[key]=[raw,...p[key].filter(v=>v!==raw)].slice(0,8);}
    });
    p.lastUserMessage=raw;
  }

  function setPending(mode,missing){
    const b=ensureBrain();
    b.mode=mode;
    b.pending={mode,missing,askedAt:new Date().toISOString()};
  }

  function clearPending(){
    const b=ensureBrain();
    b.pending=null;
    b.mode=null;
  }

  function onboardingReply(x){
    const b=ensureBrain();
    if(/\b(set (me )?up|setup|build my plan|personalize|personalise|make my schedule|create my routine|start over with my routine)\b/.test(x)){
      setPending("onboarding",["schedule","responsibilities","goals"]);
      return "Yep. Let's build YOUR RĀSI instead of giving you a generic productivity template. 🧠\n\nFirst: what is your normal weekday schedule — wake time, college/school/work hours, commute, and usual sleep time?";
    }
    if(b.pending?.mode==="onboarding"){
      rememberUser(x);
      const missing=b.pending.missing||[];
      if(missing.includes("schedule")){
        b.pending.missing=["responsibilities","goals"];
        return "Got it. Now give me the things that are non-negotiable in your day — classes, work, family responsibilities, commute, meals, clubs, anything that has a fixed place.";
      }
      if(missing.includes("responsibilities")){
        b.pending.missing=["goals"];
        return "Good. Last big piece: what do you actually want your free time to achieve? Give me your main goals, plus anything you definitely DON'T want RĀSI to schedule.";
      }
      if(missing.includes("goals")){
        clearPending();
        return "Perfect. I have enough to draft the structure. I’ll keep fixed commitments protected, fit flexible goals around them, and flag anything that needs your confirmation before changing it. Want me to build the first draft?";
      }
    }
    return null;
  }

  function exerciseReply(x){
    const b=ensureBrain();
    if(/\b(start|begin|want to|wanna)\b.*\b(exercis|workout|fitness|gym|running|push[- ]?ups?)\b/.test(x)){
      setPending("exercise",["experience","goal","time","constraints"]);
      return "Absolutely — but I'm NOT throwing 10 km runs and random push-ups at you. 😭\n\nFirst: what does your current activity look like? Tell me what you can comfortably do right now (walking, push-ups, running, yoga, gym, etc.) and roughly how often.";
    }
    if(b.pending?.mode==="exercise"){
      const m=b.pending.missing||[];
      if(m.includes("experience")){b.pending.missing=["goal","time","constraints"];rememberUser(x,"exercise");return "Got it. What is the main goal: general fitness, strength, stamina, weight-related goal, mobility, sport performance, or something else?"}
      if(m.includes("goal")){b.pending.missing=["time","constraints"];return "How much time can you realistically give it per session, and how many days per week?"}
      if(m.includes("time")){b.pending.missing=["constraints"];return "Any injuries, pain, medical restrictions, equipment limits, or exercises you want to avoid? If there are health concerns, I'll keep the plan conservative and won't pretend to diagnose you."}
      if(m.includes("constraints")){clearPending();return "That gives me the starting point. Next I'll build from your actual level, then progress based on completion and feedback — not just the calendar. If you miss a day, the progression can shift forward instead of making you restart."}
    }
    return null;
  }

  function recentAssistantTexts(){
    const s=safeState();
    return (s.chat||[]).filter(m=>m.who!=="you").slice(-8).map(m=>lower(m.text));
  }
  function freshPick(options){
    const recent=recentAssistantTexts();
    const fresh=options.filter(v=>!recent.includes(lower(v)));
    return pick(fresh.length?fresh:options);
  }
  function clearIrrelevantPending(x){
    const b=ensureBrain();
    if(!b.pending)return;
    const switchTopic=/^(hi|hey|hello|hii|yo|thanks|thank you|okay|ok|cool|nice|lol|haha)\b/.test(x) ||
      /\b(change|move|remove|add|schedule|plan|tomorrow|today|college|festival|chess|study|workout|exercise)\b/.test(x);
    if(switchTopic)clearPending();
  }
  function naturalConversationReply(raw){
    const x=lower(raw);
    clearIrrelevantPending(x);
    if(/^(hi|hey|hello|hii|hiiii|yo|sup)\b/.test(x))return freshPick([
      "Heyyy 😭 What's happening?","Hii. I'm here. Tell me everything.","Yo 👀 What are we dealing with today?"
    ]);
    if(/\bhow are you\b/.test(x))return freshPick([
      "I'm good 😌 More importantly, how are you actually doing?",
      "Pretty good 😂 What's going on with you?",
      "I'm here and functioning 😭 How's your day?"
    ]);
    if(/\b(thank you|thanks|thx)\b/.test(x))return freshPick(["Anytime 🫶","Of course.","Always."]);
    if(/^(okay|ok|alright|cool|nice|got it)\b/.test(x))return freshPick(["Okay 😌","Gotcha.","Cool. What's next?","Alright, I'm with you."]);
    if(/\b(sorry|my bad)\b/.test(x))return freshPick([
      "You're fine. Just tell me what changed.","No stress. What's actually going on?","You don't need to apologize to me 😭"
    ]);
    if(/\b(what do you think|your opinion|what's your take|what do u think)\b/.test(x))return freshPick([
      "I can give you my take. Give me the full context first.",
      "Okay, opinion mode 👀 What's the situation?",
      "I have a perspective, but I don't want to decide for you. Tell me what happened."
    ]);
    if(/\b(stress|stressed|overwhelmed|burnt out|exhausted|drained|sad|lonely|guilty|demotivated|no motivation)\b/.test(x))return freshPick([
      "Okay, no productivity speech. 🫂 What happened?",
      "Tell me the messy version first. We can sort it out after.",
      "Yeah, that sounds like a lot. What's bothering you most?"
    ]);
    if(/\b(happy|excited|proud|got selected|did it|finished|passed|won|good news)\b/.test(x))return freshPick([
      "WAIT 😭 Okay, that's actually good. Tell me what happened.",
      "Okayyy, I need the story now 👀","Yesss. I'm listening. What happened?"
    ]);
    if(/\b(confused|don't understand|dont understand|stuck|can't figure|cannot figure)\b/.test(x))return freshPick([
      "Okay, show me where you're stuck.","Let's untangle it. What part isn't making sense?","Give me the exact bit that's confusing you."
    ]);
    if(/\b(bored|nothing to do)\b/.test(x))return freshPick([
      "Dangerous sentence 😂 What kind of bored — fun bored or useful bored?",
      "Choose your chaos: fun, useful, or completely random?","I refuse to let you scroll into another dimension 😭"
    ]);
    if(/\bwhat can you do\b|\bhow can you help\b/.test(x))
      return "I can talk with you normally, or help with your actual day when you want that. I can remember useful context, help with college and skills, and make schedule changes when you ask. Not every message has to become a task.";
    if(/\btalk to me (as|like) a friend\b|\bbe my friend\b/.test(x))
      return "Yeah 🫶. And I don't need to keep announcing that every two messages. Just talk normally. I'll listen, joke around when it fits, give you my perspective when you ask, and switch into planning when you actually need it.";
    if(/\bremember\b.*\bme\b|\bdo you remember\b/.test(x)){
      const mem=safeState().rasiMemory||[];
      return mem.length?"Yeah. I keep useful context rather than saving every random sentence. One thing I remember is: “"+mem[0]+"”":"I haven't built much useful memory yet. Tell me what you want me to remember.";
    }
    if(/\b(today|tomorrow|yesterday|college|class|festival|friend|family|roommate|pg|project|assignment|teacher|professor|exam|chess|treasure hunt)\b/.test(x))
      return freshPick(["Okay, I'm following. Keep going.","Yeah, I get the context. What happened next?","Got you. What's the part you want me to help with?","I'm following you — continue."]);
    return freshPick(["Go on. I'm listening.","Okay, I'm with you. Keep going.","Tell me more — I don't want to guess.","Yeah? 👀","I'm listening. What happened?"]);
  }

  async function remoteReply(raw){
    if(!ENDPOINT) return null;
    const payload={
      message:raw,
      context:context(),
      capabilities:["conversation","memory","planning","tool-intent"],
      instruction:"Return concise natural RĀSI dialogue. Ask counter-questions when important information is missing. Never claim an action happened unless a tool result confirms it. Treat web-derived or inferred information as uncertain until verified."
    };
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),12000);
    try{
      const r=await fetch(ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),signal:controller.signal});
      if(!r.ok) return null;
      const data=await r.json();
      return norm(data.reply||data.output_text||data.text);
    }catch(e){return null}finally{clearTimeout(timer)}
  }

  // Real schedule reasoning: explicit changes can affect several dates at once.
  function parseTime(text){
    const m=String(text||"").match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
    if(!m)return null; let h=Number(m[1]), min=Number(m[2]||0), ap=m[3].toUpperCase();
    if(h<1||h>12||min>59)return null; return String(h).padStart(2,"0")+":"+String(min).padStart(2,"0")+" "+ap;
  }
  function addMins(time,mins){
    const p=String(time).match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i); if(!p)return time;
    let h=Number(p[1]),m=Number(p[2]),ap=p[3].toUpperCase(); if(ap==="PM"&&h!==12)h+=12;if(ap==="AM"&&h===12)h=0;
    let total=((h*60+m+mins)%1440+1440)%1440, hh=Math.floor(total/60), mm=total%60, outAp=hh>=12?"PM":"AM";
    hh=hh%12||12; return String(hh).padStart(2,"0")+":"+String(mm).padStart(2,"0")+" "+outAp;
  }
  function dayOffset(raw){
    const x=lower(raw), n=x.match(/(?:next|for|over)\s+(\d+)\s+days?/);
    if(n)return Math.max(1,Math.min(14,Number(n[1]))); if(/tomorrow/.test(x))return 2;
    if(/this week|rest of the week/.test(x))return 7; return 1;
  }
  function datesForRange(raw){
    const n=dayOffset(raw), start=new Date(); start.setHours(12,0,0,0); const out=[];
    for(let i=0;i<n;i++){const d=new Date(start);d.setDate(start.getDate()+i);out.push(d);} return out;
  }
  function taskWords(raw){
    const x=lower(raw), map=[
      ["coding",["coding","c programming","c code","programming"]],["study",["study","studying","revision","revise","notes","academics"]],
      ["pinterest",["pinterest","pins","pin"]],["english",["english","spoken english","speaking","vocabulary"]],
      ["career",["career","content strategy","chessbase","cbi","agency","creatorcollabs","marketing","cold call"]],
      ["health",["exercise","workout","yoga","pranayama","walk","fitness"]],["knowledge",["reading","read","encyclopedia","curiosity"]],
      ["life",["friends","college life","social","fun"]]];
    for(const pair of map)if(pair[1].some(w=>x.includes(w)))return {cat:pair[0]}; return null;
  }
  function findTask(arr,raw){
    const info=taskWords(raw), x=lower(raw);
    if(info){const t=arr.find(q=>q.cat===info.cat&&!q.done&&q.cat!=="college")||arr.find(q=>q.cat===info.cat);if(t)return t;}
    return arr.filter(q=>q.cat!=="college").find(q=>x.includes(lower(q.n)))||null;
  }
  function rangeLabel(ds){
    if(ds.length===1)return ds[0].toLocaleDateString([],{weekday:"long"});
    return ds[0].toLocaleDateString([],{weekday:"short",day:"numeric",month:"short"})+" → "+ds[ds.length-1].toLocaleDateString([],{weekday:"short",day:"numeric",month:"short"});
  }
  function scheduleCommand(raw){
    const x=lower(raw), s=safeState();
    if(typeof tasksForDate!=="function"||typeof dateKey!=="function")return null;
    const now=new Date(), base=new Date(now); base.setHours(12,0,0,0), dates=[];
    if(/\btomorrow\b/.test(x)){const d=new Date(base);d.setDate(base.getDate()+1);dates.push(d);}
    if(/\bday after tomorrow\b/.test(x)){const d=new Date(base);d.setDate(base.getDate()+2);dates.push(d);}
    if(!dates.length)dates.push(...datesForRange(raw));
    const results=[];
    const hasIntent=/\b(change|alter|adjust|rearrange|reorganize|reschedule|modify|fix|update|replace|remove|drop|skip|cancel|free up|make room|make space|add|put|keep|leave)\b/.test(x);

    if(hasIntent && /\b(no classes|no class|festival|college (one|blocks?|schedule)|change the college|there won't be classes|there wont be classes|classes won't|classes wont)\b/.test(x) && dates.length>=2){
      let changed=0; state.collegeOffDates=state.collegeOffDates||{};
      dates.forEach(d=>{const k=dateKey(d);if(!state.collegeOffDates[k]){state.collegeOffDates[k]=true;changed++;}});
      results.push(changed?"College timetable OFF for "+dates.map(d=>d.toLocaleDateString([],{weekday:"short",day:"numeric",month:"short"})).join(" & "):"College timetable was already OFF for those dates");
    }

    if(/\b(free|open|make|give me|leave me)\b.*\b(slot|time|space)\b/.test(x)&&/\bchess\b/.test(x)&&/\btoday\b/.test(x)){
      const today=new Date();today.setHours(12,0,0,0);const k=dateKey(today),arr=tasksForDate(today);
      if(arr.some(t=>/\bchess\b/i.test(t.n||"")))results.push("Chess practice is already on today's plan.");
      else{
        const current=new Date(), nowMin=current.getHours()*60+current.getMinutes();
        const future=t=>!t.done&&minutes(t.e)>nowMin;
        const candidate=arr.find(t=>t.cat==="buffer"&&future(t))||arr.find(t=>["knowledge","career","pinterest","english","life"].includes(t.cat)&&future(t));
        if(candidate){
          const st=candidate.s,dur=Math.max(20,Math.min(45,minutes(candidate.e)-minutes(candidate.s)));
          candidate.n="Chess practice";candidate.cat="life";candidate.info="Free slot requested by you.";
          candidate.e=addMins(st,dur);results.push("Chess practice added today at "+st+"–"+candidate.e);
        }else results.push("I couldn't find a safe future slot for Chess today without moving a protected block.");
      }
    }

    const target=taskWords(raw),time=parseTime(raw);
    if(target&&/\b(remove|delete|drop|skip|pause|stop)\b/.test(x)&&(/\bnext \d+ days?\b/.test(x)||/\btomorrow\b/.test(x)||/\bthis week\b/.test(x))){
      let changed=0;dates.forEach(d=>{const k=dateKey(d),arr=tasksForDate(d),before=arr.length;state.dateTasks[k]=arr.filter(t=>!(t.cat===target.cat&&t.cat!=="college"));changed+=before-state.dateTasks[k].length;});
      results.push(changed?"Removed "+target.cat+" blocks across "+rangeLabel(dates):"There was no "+target.cat+" block across "+rangeLabel(dates));
    }
    if(target&&time&&/\b(move|shift|reschedule|change|put|make)\b/.test(x)){
      const changed=[];dates.forEach(d=>{const arr=tasksForDate(d),t=findTask(arr,raw);if(!t)return;const dur=Math.max(15,minutes(t.e)-minutes(t.s));t.s=time;t.e=addMins(time,dur);arr.sort((a,z)=>minutes(a.s)-minutes(z.s)).forEach((q,i)=>q.order=i);changed.push(t.n+" → "+t.s+"–"+t.e);});
      if(changed.length)results.push("Moved "+target.cat+" for "+rangeLabel(dates)+": "+changed.slice(0,4).join(", "));
    }
    if(/\b(more study|more revision|need extra study|study more|exam prep|exam is coming)\b/.test(x)){
      const removed=[];dates.forEach(d=>{const k=dateKey(d),arr=tasksForDate(d);["pinterest","career","english","knowledge"].forEach(cat=>{const t=arr.find(q=>q.cat===cat&&!q.done);if(t){state.dateTasks[k]=state.dateTasks[k].filter(q=>q.id!==t.id);removed.push(t.n);}});});
      results.push(removed.length?"Made the next "+dates.length+" days more study-heavy by clearing lower-priority blocks.":"Those days already have the lower-priority blocks cleared.");
    }
    if(/\b(lighten|lighter|less packed|less busy|reduce my load)\b/.test(x)){
      const removed=[];dates.forEach(d=>{const k=dateKey(d),arr=tasksForDate(d);["knowledge","career","pinterest","english"].forEach(cat=>{const t=arr.find(q=>q.cat===cat&&!q.done);if(t){state.dateTasks[k]=state.dateTasks[k].filter(q=>q.id!==t.id);removed.push(t.n);}});});
      results.push(removed.length?"Lightened "+rangeLabel(dates)+" by removing the least essential flexible blocks.":"Those days are already relatively light.");
    }
    if(results.length){saveRender();return "Done. "+results.join(". ")+".";}
    return null;
  }
  function scheduleConversationReply(raw){
    const x=lower(raw), s=safeState();
    if(/\b(did you|have you|did rasi|did you actually)\b.*\b(change|update|modify|rearrange|schedule|plan)\b/.test(x)&&/\b(tomorrow|day after tomorrow|today)\b/.test(x)){
      const d=new Date();d.setHours(12,0,0,0);
      if(/\bday after tomorrow\b/.test(x))d.setDate(d.getDate()+2);else if(/\btomorrow\b/.test(x))d.setDate(d.getDate()+1);
      const k=dateKey(d),off=!!(s.collegeOffDates&&s.collegeOffDates[k]),label=d.toLocaleDateString([],{weekday:"long",day:"numeric",month:"short"});
      return off?"Yes — I changed "+label+". The normal college timetable is OFF for that day, and the rest of your plan remains in place.":"Not yet. I only changed today's Chess slot; I didn't apply the college change to "+label+". That's my mistake.";
    }
    if(/\bwhat did you change\b|\bwhat have you changed\b/.test(x))return ensureBrain().profile.lastScheduleChange||"I haven't changed the schedule yet.";
    return null;
  }
  async function brainCommand(){
    try{
    const input=document.getElementById("buddyInput");
    const raw=norm(input?.value);
    if(!raw) return;
    input.value="";
    const s=safeState();
    if(!Array.isArray(s.chat)) s.chat=[];
    s.chat.push({who:"you",text:raw});
    rememberUser(raw);

    // Explicit app actions still go through the existing controlled tool logic.
    const x=lower(raw);
    const actionLike=/^(add|schedule|plan|move|shift|reschedule|remove|delete|change|rebuild|replace|skip|cancel|replan|rearrange|lighten)\b/.test(x) ||
      /\b(move|add|remove|delete|reschedule|replan|lighten|change|adjust|modify|rearrange|reorganize|free up|make room|make space)\b/.test(x) ||
      /\b(no classes|no class|festival|there won't be classes|there wont be classes|free slot|open slot)\b/.test(x);
    let reply=scheduleConversationReply(raw)||scheduleCommand(raw);
    if(reply){
      const brain=ensureBrain(); brain.profile.lastScheduleChange=reply; brain.updatedAt=new Date().toISOString();
      pushReply(reply); return;
    }
    if(actionLike && typeof window.rasiLegacyBuddyCommand==="function"){
      s.chat.pop(); input.value=raw; window.rasiLegacyBuddyCommand(); return;
    }
    const brainNow=ensureBrain();
    const pendingCanContinue=!!brainNow.pending &&
      !/^(hi|hey|hello|hii|yo|thanks|thank you|okay|ok|cool|nice|lol|haha)\b/.test(x) &&
      !/\b(change|move|remove|add|schedule|plan|tomorrow|today|college|festival|chess|study|workout|exercise)\b/.test(x);
    reply=pendingCanContinue ? (onboardingReply(x)||exerciseReply(x)) : null;
    if(!reply) reply=await remoteReply(raw);
    if(!reply) reply=naturalConversationReply(raw);
    pushReply(reply);
    }catch(err){
      console.error("RASI brain error",err);
      const input=document.getElementById("buddyInput");
      if(input) input.value=raw||input.value||"";
      const s=safeState();
      if(s.chat && s.chat[s.chat.length-1]?.who==="you") s.chat.pop();
      pushReply("I hit a small brain error instead of sending that. Your schedule was not changed. Try sending it again.");
    }
  }

  // Replace only the chat brain; the existing planner/action functions remain intact.
  window.rasiLegacyBuddyCommand=window.buddyCommand;
  window.buddyCommand=brainCommand;
  window.RASI_BRAIN={version:VERSION,context,remember,remoteReply,config:CONFIG};
  ensureBrain();
})();

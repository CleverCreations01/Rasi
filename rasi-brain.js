/* RĀSI Brain v1 — private prototype brain layer.
   No secrets live here. A future secure backend can be connected through RASI_AI_ENDPOINT.
*/
(() => {
  "use strict";
  const VERSION = "brain-v2";
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

  function variedFriendReply(x){
    const ts=taskSummary();
    if(/^(hi|hey|hii|hello|yo|sup)\b/.test(x))
      return pick([
        "Hiiii. ✨ I'm here. What's going on?",
        "Heyyy. 👀 Give me the situation — college, life, work, or pure chaos?",
        "Yo 😭 RĀSI is online. What's happening?"
      ]);
    if(/\bhow are you\b/.test(x))
      return "I'm good in the only way an AI can be 😌 — ready for whatever you throw at me. More importantly, how are YOU actually doing?";
    if(/\bwhat can you do\b|\bwhat do you do\b|\bhow can you help\b/.test(x))
      return "A lot more than replying to messages. 🧠 I can learn useful context about you, ask questions before building a plan, reason about your schedule, help with study/skills/exercise, research when that capability is connected, and eventually change your RĀSI plan through controlled actions. I shouldn't blindly change important things — I'll ask when confirmation matters.";
    if(/\btalk to me (as|like) a friend\b|\bbe my friend\b/.test(x))
      return "Yeah. 🫶 You don't have to turn every conversation into a task. Tell me what happened, what you're thinking, or what you need — I'll listen first, give you a perspective when useful, and let you make the final call.";
    if(/\bremember\b|\bdo you remember me\b/.test(x)){
      const mem=safeState().rasiMemory||[];
      return mem.length ? "Yeah — I keep a small set of useful context on this device. For example: “"+mem[0]+"” ✦ I won't treat every random message as permanent memory.":"I haven't saved much useful context yet. Tell me the things you want RĀSI to understand about you.";
    }
    if(/\b(study|syllabus|backlog|revision|exam)\b/.test(x))
      return "Okay, let's make that concrete. 🧠 What are you studying, what is currently pending, and how much time do you realistically have today? I don't want to invent a plan without knowing those three things.";
    if(/\b(stress|stressed|overwhelmed|burnt out|burnout|exhausted|drained|sad|lonely|guilty|demotivated|no motivation)\b/.test(x))
      return pick([
        "Okay. No productivity lecture. 🫂 Tell me the messy version first. We can decide what actually needs action after that.",
        "Pause for a second. You don't have to solve your whole life tonight. Tell me what happened; I'll help separate the actual problem from the pressure around it.",
        "I'm listening. 👀 What is the part that's bothering you most right now?"
      ]);
    if(ts.next)
      return pick([
        "I'm with you. ✨ Tell me what changed or what you're thinking about, and I'll use your current plan as context instead of starting from zero.",
        "Okay, talk to me. 👀 I know your next planned block is "+ts.next+(ts.nextTime?" at "+ts.nextTime:"")+", but that doesn't mean the plan is sacred. What's going on?",
        "Got you. 🧠 Give me the context first. Then we'll decide whether this needs a conversation, a plan change, or both."
      ]);
    return pick([
      "I'm listening. 👀 What's actually on your mind?",
      "Go on. 😌 You don't need to phrase it perfectly.",
      "Okay, I'm here. Tell me the situation and what you want from me — listening, an opinion, or an actual plan."
    ]);
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

  async function brainCommand(){
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
      /\b(move|add|remove|delete|reschedule|replan)\b.*\b(today|tomorrow|coding|study|pinterest|english|exercise|workout|task|schedule)\b/.test(x);
    if(actionLike && typeof window.rasiLegacyBuddyCommand==="function"){
      // The legacy handler owns action execution and also records the user message.
      s.chat.pop();
      input.value=raw;
      window.rasiLegacyBuddyCommand();
      return;
    }

    let reply=onboardingReply(x)||exerciseReply(x);
    if(!reply) reply=await remoteReply(raw);
    if(!reply) reply=variedFriendReply(x);
    pushReply(reply);
  }

  // Replace only the chat brain; the existing planner/action functions remain intact.
  window.rasiLegacyBuddyCommand=window.buddyCommand;
  window.buddyCommand=brainCommand;
  window.RASI_BRAIN={version:VERSION,context,remember,remoteReply,config:CONFIG};
  ensureBrain();
})();

import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createClient} from '@supabase/supabase-js';
import {Send, Paperclip, Mic, Users, Search, LogOut, Plus, ArrowLeft, Image as ImageIcon, X, MessageCircle} from 'lucide-react';
import './style.css';

const url=import.meta.env.VITE_SUPABASE_URL, key=import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase=url&&key?createClient(url,key):null;
function App(){
 const [session,setSession]=useState(null),[profile,setProfile]=useState(null),[chats,setChats]=useState([]),[active,setActive]=useState(null),[messages,setMessages]=useState([]),[text,setText]=useState(''),[search,setSearch]=useState(''),[people,setPeople]=useState([]),[showPeople,setShowPeople]=useState(false),[groupName,setGroupName]=useState(''),[groupUsers,setGroupUsers]=useState([]),[showGroup,setShowGroup]=useState(false),[file,setFile]=useState(null),[busy,setBusy]=useState(false),[recording,setRecording]=useState(false),[notice,setNotice]=useState('');
 const bottom=useRef(null), media=useRef(null), chunks=useRef([]), fileRef=useRef(null);
 const toast=(s)=>{setNotice(s);setTimeout(()=>setNotice(''),3500)};
 useEffect(()=>{if(!supabase)return;supabase.auth.getSession().then(({data})=>setSession(data.session));const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));return()=>subscription.unsubscribe()},[]);
 useEffect(()=>{if(session)loadProfileAndChats();else{setProfile(null);setChats([]);setActive(null)}},[session]);
 async function loadProfileAndChats(){
  const u=session.user;
  let {data:p}=await supabase.from('profiles').select('*').eq('id',u.id).maybeSingle();
  if(!p){const username=(u.email?.split('@')[0]||'user')+'_'+u.id.slice(0,4);const r=await supabase.from('profiles').upsert({id:u.id,username,display_name:u.user_metadata?.display_name||username}).select().single();p=r.data}
  setProfile(p);await loadChats();
 }
 async function loadChats(){
  const {data:mem}=await supabase.from('chat_members').select('chat_id').eq('user_id',session.user.id);
  if(!mem?.length){setChats([]);return}
  const ids=mem.map(x=>x.chat_id);
  const {data}=await supabase.from('chats').select('id,title,is_group,created_at,chat_members(user_id,profiles(id,username,display_name))').in('id',ids).order('created_at',{ascending:false});
  setChats(data||[]);
 }
 useEffect(()=>{if(!active)return;loadMessages();const channel=supabase.channel('messages-'+active).on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:`chat_id=eq.${active}`},async payload=>{const {data}=await supabase.from('messages').select('*,profiles!messages_sender_id_profiles_fkey(username,display_name)').eq('id',payload.new.id).single();if(data)setMessages(old=>old.some(m=>m.id===data.id)?old:[...old,data])}).subscribe();return()=>supabase.removeChannel(channel)},[active]);
 useEffect(()=>{bottom.current?.scrollIntoView({behavior:'smooth'})},[messages]);
 async function loadMessages(){const {data,error}=await supabase.from('messages').select('*,profiles!messages_sender_id_profiles_fkey(username,display_name)').eq('chat_id',active).order('created_at');if(error)toast(error.message);else setMessages(data||[])}
 async function auth(e){e.preventDefault();const form=new FormData(e.currentTarget),email=form.get('email'),password=form.get('password'),name=form.get('name');setBusy(true);let r;if(name)r=await supabase.auth.signUp({email,password,options:{data:{display_name:name}}});else r=await supabase.auth.signInWithPassword({email,password});setBusy(false);if(r.error)toast(r.error.message);else if(name)toast('РџСЂРѕРІРµСЂСЊ РїРѕС‡С‚Сѓ, РµСЃР»Рё РІРєР»СЋС‡РµРЅРѕ РїРѕРґС‚РІРµСЂР¶РґРµРЅРёРµ СЂРµРіРёСЃС‚СЂР°С†РёРё.')}
 async function searchPeople(q){setSearch(q);if(q.trim().length<2){setPeople([]);return}const {data}=await supabase.from('profiles').select('id,username,display_name').ilike('username',`%${q}%`).neq('id',session.user.id).limit(12);setPeople(data||[])}
 async function direct(user){setBusy(true);const {data,error}=await supabase.rpc('create_direct_chat',{other_user:user.id});setBusy(false);if(error){toast(error.message);return}await loadChats();setShowPeople(false);setSearch('');setActive(data)}
 async function createGroup(e){
  e.preventDefault();
  if(!groupName.trim())return;
  setBusy(true);
  const {data:chatId,error}=await supabase.rpc('create_group_chat',{
    group_title:groupName.trim(),
    member_ids:groupUsers
  });
  setBusy(false);
  if(error){toast(error.message);return}
  setShowGroup(false);
  setGroupName('');
  setGroupUsers([]);
  await loadChats();
  setActive(chatId);
}async function sendMessage(e){e?.preventDefault();if((!text.trim()&&!file)||!active)return;setBusy(true);let attachment=null;if(file){const ext=file.name?.split('.').pop()||'bin',path=`${active}/${crypto.randomUUID()}.${ext}`;const {error}=await supabase.storage.from('chat-media').upload(path,file,{contentType:file.type||'application/octet-stream'});if(error){setBusy(false);toast(error.message);return}const {data}=supabase.storage.from('chat-media').getPublicUrl(path);attachment={url:data.publicUrl,type:file.type.startsWith('image/')?'image':file.type.startsWith('video/')?'video':'audio',name:file.name||'Р“РѕР»РѕСЃРѕРІРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ'};}
 const {error}=await supabase.from('messages').insert({chat_id:active,sender_id:session.user.id,body:text.trim(),attachment_url:attachment?.url||null,attachment_type:attachment?.type||null});setBusy(false);if(error){toast(error.message);return}setText('');setFile(null);if(fileRef.current)fileRef.current.value='';}
 async function startVoice(){if(recording){media.current.stop();return}try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});chunks.current=[];const rec=new MediaRecorder(stream);media.current=rec;rec.ondataavailable=e=>{if(e.data.size)chunks.current.push(e.data)};rec.onstop=()=>{const blob=new Blob(chunks.current,{type:rec.mimeType||'audio/webm'});const f=new File([blob],`voice-${Date.now()}.webm`,{type:blob.type});setFile(f);stream.getTracks().forEach(t=>t.stop());setRecording(false)};rec.start();setRecording(true)}catch{toast('Р Р°Р·СЂРµС€Рё РґРѕСЃС‚СѓРї Рє РјРёРєСЂРѕС„РѕРЅСѓ РІ Р±СЂР°СѓР·РµСЂРµ')}}
 if(!supabase)return <div className="setup"><div className="logo">вћ¤</div><h1>TeleWave</h1><h2>РќСѓР¶РЅРѕ РїРѕРґРєР»СЋС‡РёС‚СЊ СЃРµСЂРІРµСЂ</h2><p>РћС‚РєСЂРѕР№ С„Р°Р№Р» README.md РёР· РїСЂРѕРµРєС‚Р° Рё РІС‹РїРѕР»РЅРё РЅР°СЃС‚СЂРѕР№РєСѓ Supabase. Р—Р°С‚РµРј РґРѕР±Р°РІСЊ URL Рё РєР»СЋС‡ РїСЂРѕРµРєС‚Р° РІ С„Р°Р№Р» .env.</p></div>;
 if(!session)return <div className="auth-wrap"><form className="auth" onSubmit={auth}><div className="logo">вћ¤</div><h1>TeleWave</h1><p>РћР±С‰Р°Р№СЃСЏ СЃРѕ СЃРІРѕРёРјРё РґСЂСѓР·СЊСЏРјРё</p><label>РРјСЏ (С‚РѕР»СЊРєРѕ РґР»СЏ СЂРµРіРёСЃС‚СЂР°С†РёРё)<input name="name" placeholder="РљР°Рє С‚РµР±СЏ Р·РѕРІСѓС‚?"/></label><label>Р­Р»РµРєС‚СЂРѕРЅРЅР°СЏ РїРѕС‡С‚Р°<input name="email" type="email" required placeholder="you@example.com"/></label><label>РџР°СЂРѕР»СЊ<input name="password" type="password" minLength="6" required placeholder="РњРёРЅРёРјСѓРј 6 СЃРёРјРІРѕР»РѕРІ"/></label><button disabled={busy}>{busy?'РџРѕРґРѕР¶РґРёвЂ¦':'Р’РѕР№С‚Рё / Р—Р°СЂРµРіРёСЃС‚СЂРёСЂРѕРІР°С‚СЊСЃСЏ'}</button><small>Р•СЃР»Рё Р°РєРєР°СѓРЅС‚Р° РЅРµС‚ вЂ” РѕРЅ Р±СѓРґРµС‚ СЃРѕР·РґР°РЅ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё.</small>{notice&&<div className="notice">{notice}</div>}</form></div>;
 const current=chats.find(c=>c.id===active);
 const titleFor=c=>c.is_group?c.title:(c.chat_members?.find(m=>m.user_id!==session.user.id)?.profiles?.display_name||c.chat_members?.find(m=>m.user_id!==session.user.id)?.profiles?.username||'Р›РёС‡РЅС‹Р№ С‡Р°С‚');
 return <div className="app"><header><div className="brand"><span className="logo small">вћ¤</span><b>TeleWave</b></div><div className="me">@{profile?.username||'user'}</div><button className="icon" onClick={()=>supabase.auth.signOut()} title="Р’С‹Р№С‚Рё"><LogOut/></button></header>
 <div className="layout"><aside className={active?'hide-mobile':''}><div className="side-top"><h2>Р§Р°С‚С‹</h2><button className="round" onClick={()=>setShowPeople(!showPeople)} title="РќР°Р№С‚Рё РґСЂСѓР·РµР№"><Search/></button><button className="round" onClick={()=>setShowGroup(true)} title="РЎРѕР·РґР°С‚СЊ РіСЂСѓРїРїСѓ"><Users/></button></div>
 {showPeople&&<div className="finder"><input value={search} onChange={e=>searchPeople(e.target.value)} placeholder="РќР°Р№С‚Рё РїРѕ @РЅРёРєСѓ"/>{people.map(p=><button className="person" key={p.id} onClick={()=>direct(p)}><span className="avatar">{(p.display_name||p.username)[0]?.toUpperCase()}</span><span><b>{p.display_name}</b><small>@{p.username}</small></span><Plus size={17}/></button>)}</div>}
 <div className="chat-list">{chats.filter(c=>titleFor(c).toLowerCase().includes(search.toLowerCase())).map(c=><button className={'chat-item '+(active===c.id?'selected':'')} key={c.id} onClick={()=>setActive(c.id)}><span className="avatar">{c.is_group?'рџ‘Ґ':titleFor(c)[0]?.toUpperCase()}</span><span className="chat-label"><b>{titleFor(c)}</b><small>{c.is_group?'Р“СЂСѓРїРїР°':'Р›РёС‡РЅС‹Р№ С‡Р°С‚'}</small></span></button>)}{!chats.length&&<p className="empty">РџРѕРєР° РЅРµС‚ С‡Р°С‚РѕРІ.<br/>РќР°Р№РґРё РґСЂСѓРіР° РїРѕ РЅРёРєСѓ РёР»Рё СЃРѕР·РґР°Р№ РіСЂСѓРїРїСѓ.</p>}</div><div className="side-foot">Р’РѕС€С‘Р» РєР°Рє {profile?.display_name||profile?.username}</div></aside>
 <main className={!active?'no-active':''}>{!current?<div className="welcome"><div className="welcome-icon"><MessageCircle size={42}/></div><h2>РўРІРѕРё СЂР°Р·РіРѕРІРѕСЂС‹ вЂ” Р·РґРµСЃСЊ</h2><p>РќР°Р№РґРё РґСЂСѓР·РµР№ РїРѕ РЅРёРєСѓ РёР»Рё СЃРѕР·РґР°Р№ РіСЂСѓРїРїСѓ.</p></div>:<><div className="conversation-head"><button className="back icon" onClick={()=>setActive(null)}><ArrowLeft/></button><span className="avatar">{current.is_group?'рџ‘Ґ':titleFor(current)[0]?.toUpperCase()}</span><div><b>{titleFor(current)}</b><small>{current.is_group?'Р“СЂСѓРїРїРѕРІРѕР№ С‡Р°С‚':'Р›РёС‡РЅР°СЏ РїРµСЂРµРїРёСЃРєР°'}</small></div></div><div className="messages">{messages.map(m=><div key={m.id} className={'message '+(m.sender_id===session.user.id?'mine':'')}><small>{m.sender_id===session.user.id?'РўС‹':m.profiles?.display_name||m.profiles?.username}</small>{m.body&&<p>{m.body}</p>}{m.attachment_url&&(m.attachment_type==='image'?<img src={m.attachment_url} alt="Р’Р»РѕР¶РµРЅРёРµ"/>:m.attachment_type==='video'?<video src={m.attachment_url} controls/>:<audio src={m.attachment_url} controls/>)}<time>{new Date(m.created_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</time></div>)}<div ref={bottom}/></div><form className="composer" onSubmit={sendMessage}><input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={e=>setFile(e.target.files[0]||null)}/><button type="button" className="icon" onClick={()=>fileRef.current?.click()} title="Р¤РѕС‚Рѕ РёР»Рё РІРёРґРµРѕ"><Paperclip/></button><button type="button" className={'icon '+(recording?'recording':'')} onClick={startVoice} title="Р“РѕР»РѕСЃРѕРІРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ"><Mic/></button><div className="compose-field">{file&&<div className="file-chip">{file.name}<button type="button" onClick={()=>setFile(null)}><X size={14}/></button></div>}<input value={text} onChange={e=>setText(e.target.value)} placeholder="РќР°РїРёСЃР°С‚СЊ СЃРѕРѕР±С‰РµРЅРёРµвЂ¦"/></div><button className="send" disabled={busy}><Send size={19}/></button></form></>}</main></div>
 {showGroup&&<div className="modal-bg"><form className="modal" onSubmit={createGroup}><button type="button" className="modal-x" onClick={()=>setShowGroup(false)}><X/></button><h2>РќРѕРІР°СЏ РіСЂСѓРїРїР°</h2><label>РќР°Р·РІР°РЅРёРµ<input value={groupName} onChange={e=>setGroupName(e.target.value)} required placeholder="РќР°РїСЂРёРјРµСЂ, Р”СЂСѓР·СЊСЏ"/></label><p>Р”РѕР±Р°РІСЊ СѓС‡Р°СЃС‚РЅРёРєРѕРІ РїРѕ РЅРёРєСѓ:</p><input placeholder="РџРѕРёСЃРє РґСЂСѓР·РµР№" value={search} onChange={e=>searchPeople(e.target.value)}/><div className="pick-list">{people.map(p=><label key={p.id} className="pick"><input type="checkbox" checked={groupUsers.includes(p.id)} onChange={e=>setGroupUsers(old=>e.target.checked?[...old,p.id]:old.filter(x=>x!==p.id))}/>{p.display_name} <small>@{p.username}</small></label>)}</div><button className="primary" disabled={busy}>РЎРѕР·РґР°С‚СЊ РіСЂСѓРїРїСѓ</button></form></div>}
 {notice&&<div className="toast">{notice}</div>}</div>
}
createRoot(document.getElementById('root')).render(<App/>);
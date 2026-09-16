const http=require("http"),fs=require("fs"),path=require("path"),crypto=require("crypto"),url=require("url");
const PORT=process.env.PORT||3000,DB=path.join(__dirname,"data/db.json");
const TU=process.env.TEACHER_USER||"teacher",TP=process.env.TEACHER_PASSWORD||"ChangeMe123!";
const seed={levels:[
{id:1,title:"المستوى الأول: كلمات",items:["أب","أم","بيت","كتاب","قلم","مدرسة","شجرة","باب","ماء","حليب","كرسي","ولد","بنت","شمس","قمر"]},
{id:2,title:"المستوى الثاني: جمل قصيرة",items:["هذا كتاب جميل.","أنا أحب القراءة.","ذهب خالد إلى المدرسة.","جلست البنت على الكرسي.","شرب الطفل الماء.","في البيت باب كبير.","قرأ الطالب قصة مفيدة.","طلعت الشمس في الصباح."]},
{id:3,title:"المستوى الثالث: جمل متقدمة",items:["يقرأ الطالب كل يوم قصة جديدة.","ذهبت الأسرة إلى الحديقة بعد العصر.","تحب مريم أن تتعلم كلمات جديدة.","يحافظ الطفل على كتبه ويرتبها بعناية.","في الصباح يستيقظ أحمد مبكرا ويستعد للمدرسة."]}],students:{},sessions:{}};
function load(){try{return JSON.parse(fs.readFileSync(DB,"utf8"))}catch(e){fs.writeFileSync(DB,JSON.stringify(seed,null,2));return JSON.parse(JSON.stringify(seed))}} let db=load();
function save(){fs.writeFileSync(DB,JSON.stringify(db,null,2))}
function out(r,s,o,h={}){r.writeHead(s,{"Content-Type":"application/json; charset=utf-8","Access-Control-Allow-Origin":"*","Access-Control-Allow-Credentials":"true",...h});r.end(JSON.stringify(o))}
function body(q){return new Promise((ok,no)=>{let b="";q.on("data",x=>b+=x);q.on("end",()=>{try{ok(b?JSON.parse(b):{})}catch(e){no(e)}})})}
function tok(){return crypto.randomBytes(24).toString("hex")}
function auth(q,teacher=false){let t=(q.headers.cookie||"").match(/session=([^;]+)/)?.[1],s=t&&db.sessions[t];return s&&Date.now()-s.created<86400000&&(!teacher||s.teacher)?s:null}
function norm(s){return String(s||"").toLowerCase().replace(/[ًٌٍَُِّْـ]/g,"").replace(/[.,،؛!?؟:"']/g,"").replace(/\s+/g," ").trim()}
function sim(a,b){a=norm(a);b=norm(b);if(a===b)return 1;if(!a||!b)return 0;let A=[...a],B=[...b],d=Array(A.length+1).fill(0).map(()=>Array(B.length+1).fill(0));for(let i=0;i<=A.length;i++)d[i][0]=i;for(let j=0;j<=B.length;j++)d[0][j]=j;for(let i=1;i<=A.length;i++)for(let j=1;j<=B.length;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(A[i-1]===B[j-1]?0:1));return 1-d[A.length][B.length]/Math.max(A.length,B.length)}
async function route(q,r){
 let p=url.parse(q.url).pathname;
 if(q.method==="OPTIONS"){r.writeHead(204,{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"Content-Type","Access-Control-Allow-Credentials":"true"});return r.end()}
 if(q.method==="GET"&&p==="/api/levels")return out(r,200,{levels:db.levels});
 if(q.method==="POST"&&p==="/api/student/login"){let b=await body(q),name=String(b.name||"").trim();if(name.length<2)return out(r,400,{error:"اكتب اسم الطالب"});if(!db.students[name])db.students[name]={name,level:1,item:0,attempts:0,correct:0,errors:0,history:[]};let t=tok();db.sessions[t]={name,teacher:false,created:Date.now()};save();return out(r,200,{student:db.students[name]},{"Set-Cookie":`session=${t}; HttpOnly; SameSite=Lax; Path=/`})}
 if(q.method==="GET"&&p==="/api/student/me"){let s=auth(q);if(!s)return out(r,401,{error:"غير مسجل"});return out(r,200,{student:db.students[s.name]})}
 if(q.method==="POST"&&p==="/api/student/result"){let s=auth(q);if(!s)return out(r,401,{error:"غير مصرح"});let b=await body(q),st=db.students[s.name],correct=!!b.correct;st.attempts++;correct?st.correct++:st.errors++;st.history.push({date:new Date().toISOString(),level:b.level,item:b.item,target:b.target,heard:b.heard,score:b.score,correct});if(correct){let L=db.levels.find(x=>x.id==b.level);if(L&&+b.item+1<L.items.length){st.level=+b.level;st.item=+b.item+1}else if(db.levels.find(x=>x.id===+b.level+1)){st.level=+b.level+1;st.item=0}}save();return out(r,200,{student:st})}
 if(q.method==="POST"&&p==="/api/teacher/login"){let b=await body(q);if(b.username!==TU||b.password!==TP)return out(r,401,{error:"بيانات الدخول غير صحيحة"});let t=tok();db.sessions[t]={teacher:true,created:Date.now()};save();return out(r,200,{ok:true},{"Set-Cookie":`session=${t}; HttpOnly; SameSite=Lax; Path=/`})}

 if(q.method==="POST"&&p==="/api/pronunciation"){
  let b=await body(q), reference=String(b.referenceText||"").trim(), audio=String(b.audioBase64||"");
  if(!reference||!audio)return out(r,400,{error:"النص والصوت مطلوبان"});
  let key=process.env.AZURE_SPEECH_KEY,region=process.env.AZURE_SPEECH_REGION;
  if(!key||!region)return out(r,503,{error:"التقييم الصوتي الدقيق غير مفعّل بعد. أضف AZURE_SPEECH_KEY وAZURE_SPEECH_REGION في إعدادات الخادم."});
  try{
   let raw=audio.replace(/^data:audio\/wav;base64,/i,"");
   let bin=Buffer.from(raw,"base64");
   if(bin.length>8*1024*1024)return out(r,413,{error:"التسجيل كبير جدًا"});
   let cfg=Buffer.from(JSON.stringify({ReferenceText:reference,GradingSystem:"HundredMark",Granularity:"Phoneme",Dimension:"Comprehensive",EnableMiscue:true,PhonemeAlphabet:"IPA"})).toString("base64");
   let url=`https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=ar-SA&format=detailed`;
   let rr=await fetch(url,{method:"POST",headers:{"Ocp-Apim-Subscription-Key":key,"Content-Type":"audio/wav; codecs=audio/pcm; samplerate=16000","Pronunciation-Assessment":cfg,"Accept":"application/json"},body:bin});
   let txt=await rr.text(),data;try{data=JSON.parse(txt)}catch{data={raw:txt}};
   if(!rr.ok)return out(r,502,{error:"تعذر تقييم النطق من خدمة الصوت",details:data});
   let best=data?.NBest?.[0]||{}, pa=best?.PronunciationAssessment||{};
   let score=Number(pa.AccuracyScore??0), transcript=best.Display||data.Display||"";
   let words=(best.Words||[]).map(w=>({word:w.Word,score:w.PronunciationAssessment?.AccuracyScore??null,error:w.PronunciationAssessment?.ErrorType??"None",phonemes:(w.Phonemes||[]).map(p=>({phoneme:p.Phoneme,score:p.PronunciationAssessment?.AccuracyScore??null}))}));
   return out(r,200,{ok:true,score,transcript,words,raw:data});
  }catch(e){return out(r,502,{error:"تعذر الاتصال بخدمة تقييم النطق",details:String(e.message||e)})}
 }
 if(p.startsWith("/api/teacher/")){if(!auth(q,true))return out(r,401,{error:"يلزم دخول المعلم"});
  if(q.method==="GET"&&p==="/api/teacher/dashboard")return out(r,200,{students:Object.values(db.students),levels:db.levels});
  if(q.method==="POST"&&p==="/api/teacher/levels"){let b=await body(q),L=db.levels.find(x=>x.id===+b.id),text=String(b.text||"").trim(),image=String(b.image||""),exercise=["full","fatha","damma","kasra","sukun","shadda"].includes(String(b.exercise))?String(b.exercise):"full";if(!L)return out(r,404,{error:"المستوى غير موجود"});if(text){if(image && !/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(image))return out(r,400,{error:"صيغة الصورة غير مدعومة"});if(image.length>2200000)return out(r,400,{error:"حجم الصورة كبير، اختر صورة أصغر"});L.items.push({text,...(image?{image}:{}),exercise})}save();return out(r,200,{levels:db.levels})}
  if(q.method==="DELETE"&&p==="/api/teacher/item"){let b=await body(q),L=db.levels.find(x=>x.id===+b.level);if(!L)return out(r,404,{error:"المستوى غير موجود"});L.items.splice(+b.index,1);save();return out(r,200,{levels:db.levels})}
  if(q.method==="POST"&&p==="/api/teacher/reset-student"){let b=await body(q),s=db.students[b.name];if(!s)return out(r,404,{error:"الطالب غير موجود"});Object.assign(s,{level:1,item:0,attempts:0,correct:0,errors:0,history:[]});save();return out(r,200,{student:s})}
 }
 if(q.method==="GET"){let f=p==="/"?"public/index.html":("public"+p),file=path.join(__dirname,f);if(fs.existsSync(file)){let ext=path.extname(file),ct={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8"}[ext]||"text/plain";r.writeHead(200,{"Content-Type":ct});return r.end(fs.readFileSync(file))}}
 out(r,404,{error:"Not found"})
}
http.createServer((q,r)=>route(q,r).catch(e=>out(r,500,{error:"خطأ في الخادم"}))).listen(PORT,"0.0.0.0",()=>console.log("اقرأها تعمل على المنفذ "+PORT));

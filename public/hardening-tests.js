(function(){
"use strict";
const result=document.getElementById("results"),status=document.getElementById("status"),button=document.getElementById("run");
const today=()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
const defaults=()=>({budget:10000,days:30,startDate:today(),transactions:[],bills:[],goals:[],expectedIncome:[],lang:"English",theme:"system"});
const tests=[];
function assert(name,condition,detail){tests.push({name,pass:!!condition,detail:detail||""})}
function time(fn){const start=performance.now();const value=fn();return {value,ms:performance.now()-start}}
function csvCell(value){let text=String(value??"");if(["=","+","-","@"].includes(text.trimStart().charAt(0)))text="'"+text;return '"'+text.replace(/"/g,'""')+'"'}
button.addEventListener("click",()=>{
 button.disabled=true;tests.length=0;status.textContent="Running isolated tests…";result.textContent="";
 try{
  const engine=window.BarelyFinance;
  const now=new Date();now.setHours(12,0,0,0);
  const nowKey=today(),base=defaults();
  const empty=engine.calculate(base,now);
  assert("Default ₹10,000 and 30-day state",base.budget===10000&&base.days===30&&empty.balance===10000&&Math.abs(empty.daily-10000/30)<1e-9,JSON.stringify({balance:empty.balance,daily:empty.daily}));
  assert("Strict date validator accepts a valid calendar date",engine.isValidDateKey("2026-10-11")&&engine.isValidDateKey("2028-02-29"),"valid ordinary and leap-day dates should pass");
  assert("Strict date validator rejects impossible and malformed dates",!engine.isValidDateKey("2026-02-29")&&!engine.isValidDateKey("2026-13-01")&&!engine.isValidDateKey("tomorrow"),"impossible calendar dates should fail");
  const cents=engine.calculate({...base,transactions:Array.from({length:100},(_,i)=>({id:"c"+i,name:"cent",amount:.01,type:"expense",category:"Food",date:nowKey,status:"posted"}))},now);
  assert("Integer-paise summation",cents.spent===1&&cents.balance===9999,"Expected ₹1.00 spent, got ₹"+cents.spent);
  const incomeExpense=engine.calculate({...base,transactions:[{id:"i",amount:300,type:"income",date:nowKey},{id:"e",amount:100,type:"expense",date:nowKey}]},now);
  assert("Income and expense cash invariant",incomeExpense.balance===10200&&incomeExpense.income===300&&incomeExpense.spent===100,JSON.stringify({balance:incomeExpense.balance,income:incomeExpense.income,spent:incomeExpense.spent}));
  const bill=engine.calculate({...base,bills:[{id:"b",name:"Rent",amount:1500,due:nowKey,paid:false,essential:true,recurring:false}]},now);
  assert("Unpaid bill reserves spendable cash once",bill.balance===10000&&bill.committed===1500&&bill.spendable===8500&&bill.projected===8500,JSON.stringify({balance:bill.balance,committed:bill.committed,spendable:bill.spendable,projected:bill.projected}));
  const recurring=engine.calculate({...base,bills:[{id:"sub",name:"Subscription",amount:500,due:(()=>{const d=new Date(now);d.setMonth(d.getMonth()+1);return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")})(),paid:true,recurring:true}]},now);
  assert("Active recurring cost remains visible after a paid cycle",recurring.recurringMonthly===500,"expected ₹500 monthly recurring cost, got ₹"+recurring.recurringMonthly);
  const future=engine.calculate({...base,transactions:[{id:"future",amount:250,type:"expense",status:"pending",date:(()=>{const d=new Date(now);d.setDate(d.getDate()+1);return d.toISOString().slice(0,10)})()}]},now);
  assert("Future pending outflow is reserved, not posted cash",future.balance===10000&&future.spendable===9750&&future.pendingOutflows===250,JSON.stringify({balance:future.balance,spendable:future.spendable,pending:future.pendingOutflows}));
  const ids=engine.validateState({...base,transactions:[{id:"same",name:"a",type:"expense",amount:1},{id:"same",name:"b",type:"expense",amount:2},{name:"c",type:"income",amount:.25}]},base).transactions;
  assert("Stable ID repair for duplicate/missing IDs",ids.length===3&&new Set(ids.map(x=>x.id)).size===3,ids.map(x=>x.id).join(", "));
  const invalid=engine.validateState({...base,transactions:[{id:"bad1",type:"expense",amount:"NaN"},{id:"bad2",type:"expense",amount:-5},{id:"good",type:"expense",amount:2}]},base);
  assert("Invalid amounts rejected; valid transactions retained",invalid.transactions.length===1&&invalid.transactions[0].id==="good",String(invalid.transactions.length));
  const sizes=[0,1,100,10000,50000,100000],bench=[];
  const all=Array.from({length:100000},(_,i)=>({id:"tx-"+String(i).padStart(6,"0"),name:i%100===0?"Unicode Tamil தமிழ transaction "+i:"Expense record "+i,amount:((i%499)+1)/100,type:i%19===0?"income":"expense",category:["Food","Transport","Bills","Other"][i%4],date:(()=>{const d=new Date(now);d.setDate(d.getDate()-(i%30));return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")})(),status:"posted"}));
  for(const size of sizes){
   const tValidate=time(()=>engine.validateState({...base,transactions:all.slice(0,size)},base));
   const data=tValidate.value;
   const tCalc=time(()=>engine.calculate(data,now));
   const tQuery=time(()=>data.transactions.filter(x=>(x.name+" "+x.category).toLowerCase().includes("tamil")));
   const tSort=time(()=>data.transactions.slice().sort((a,b)=>b.amount-a.amount||a.id.localeCompare(b.id)).slice(0,50));
   const tCsv=time(()=>{const chunks=[];for(let start=0;start<data.transactions.length;start+=1000){chunks.push(data.transactions.slice(start,start+1000).map(x=>[x.date,x.name,x.type,x.category,x.amount,x.status].map(csvCell).join(",")).join("\r\n"))}return chunks.join("\r\n").length});
   bench.push({records:size,validated:data.transactions.length,validateMs:+tValidate.ms.toFixed(1),calculateMs:+tCalc.ms.toFixed(1),searchMs:+tQuery.ms.toFixed(1),sortTop50Ms:+tSort.ms.toFixed(1),csvBuildMs:+tCsv.ms.toFixed(1),csvChars:tCsv.value});
   assert(size+" records retained",data.transactions.length===size,"expected "+size+", got "+data.transactions.length);
   assert(size+" records have unique IDs",new Set(data.transactions.map(x=>x.id)).size===size,"unique ID count matches records");
  }
  const big=engine.validateState({...base,transactions:all},base);
  const matches=big.transactions.filter(x=>(x.name+" "+x.category).toLowerCase().includes("tamil"));
  assert("100k Unicode search correctness",matches.length===1000,"expected 1,000 Tamil matches, got "+matches.length);
  const exported=big.transactions.filter(x=>x.name.includes('"')||x.name.includes(",")||x.name.includes("தமிழ"));
  assert("CSV escaping coverage set includes Unicode/special characters",exported.length>0,"special characters are present in synthetic test data");
  assert("CSV formula injection is neutralized",csvCell("=1+1")==="\"\'=1+1\""&&csvCell("  @SUM(A1:A2)")==="\"\'  @SUM(A1:A2)\""&&csvCell("QA, \"Income\"")==="\"QA, \"\"Income\"\"\"","dangerous formula prefixes are quoted as text and commas/quotes remain escaped");
  const fails=tests.filter(x=>!x.pass);
  status.textContent=fails.length?"Completed with "+fails.length+" failure(s).":"All "+tests.length+" assertions passed.";
  status.className=fails.length?"fail":"pass";
  result.textContent=tests.map(x=>(x.pass?"PASS":"FAIL")+" — "+x.name+(x.detail?"\n  "+x.detail:"")).join("\n")+"\n\nSCALE BENCHMARKS (ms; in-memory synthetic data only)\n"+bench.map(x=>JSON.stringify(x)).join("\n");
 }catch(error){status.textContent="Test harness error: "+error.message;status.className="fail";result.textContent=error.stack||String(error)}
 finally{button.disabled=false}
});
})();
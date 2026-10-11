/* barely. financial engine — one source of truth for all screens.
   Semantics: posted transactions change cash; unpaid bills/pending expenses are reserves;
   savings goals are protected allocations, not expenses; recurring bills forecast future cycles. */
(function(){
  const n = v => Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v)*100)/100) : 0;
  const sum = (xs, fn) => xs.reduce((s,x)=>s+n(fn(x)),0);
  const dateOnly = d => { const x=new Date(d); if(Number.isNaN(x.getTime())) return null; x.setHours(0,0,0,0); return x; };
  const dayKey = d => { const x=new Date(d); return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); };
  const addMonth = d => { const x=new Date(d); const day=x.getDate(); x.setDate(1); x.setMonth(x.getMonth()+1); const last=new Date(x.getFullYear(),x.getMonth()+1,0).getDate(); x.setDate(Math.min(day,last)); return x; };
  const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
  function calculate(data, now=new Date()){
    const d=data||{}, today=dateOnly(now)||dateOnly(new Date());
    const days=Math.max(1,Math.min(365,Math.floor(Number(d.days)||30)));
    const budget=n(d.budget);
    const start=dateOnly(d.startDate||today)||today;
    const elapsed=Math.max(0,Math.floor((today-start)/86400000));
    const remaining=Math.max(0,days-elapsed);
    const end=new Date(today); end.setDate(end.getDate()+Math.max(0,remaining-1));
    const tx=Array.isArray(d.transactions)?d.transactions:[];
    const bills=Array.isArray(d.bills)?d.bills:[];
    const goals=Array.isArray(d.goals)?d.goals:[];
    const posted=tx.filter(x=>x&&x.status!=='pending'&&(!x.date||!dateOnly(x.date)||dateOnly(x.date)<=today));
    const income=sum(posted.filter(x=>x.type==='income'),x=>x.amount);
    const spent=sum(posted.filter(x=>x.type==='expense'),x=>x.amount);
    const balance=Math.round((budget+income-spent)*100)/100;
    const pendingTx=tx.filter(x=>x&&x.status==='pending');
    const pendingOutflows=sum(pendingTx.filter(x=>x.type==='expense'&&(!x.date||!dateOnly(x.date)||dateOnly(x.date)<=end)),x=>x.amount);
    const unpaid=bills.filter(b=>b&&!b.cancelled&&!b.paused&&(!b.paid||(b.recurring&&dateOnly(b.due||today)<=today)));
    const committed=sum(unpaid,x=>x.amount);
    const savings=sum(goals,x=>x.saved);
    const spendable=Math.round((balance-committed-savings-pendingOutflows)*100)/100;
    let forecastCommitments=0,upcoming=0,essential=0,recurringMonthly=0;
    unpaid.forEach(b=>{
      const amount=n(b.amount),due=dateOnly(b.due||today)||today;
      if(due>=today&&due<=end){upcoming+=amount;}
      if(b.essential) essential+=amount;
      if(b.recurring){
        recurringMonthly+=amount;
        let next=due<today?new Date(today):new Date(due);
        let guard=0;
        while(next<=end&&guard++<14){forecastCommitments+=amount;next=addMonth(next);}
      } else if(due<=end) forecastCommitments+=amount;
    });
    bills.filter(b=>b&&b.recurring&&b.paid&&!b.cancelled&&!b.paused&&(dateOnly(b.due||today)||today)>today).forEach(b=>{let next=dateOnly(b.due||today)||today,guard=0;while(next<=end&&guard++<14){forecastCommitments+=n(b.amount);next=addMonth(next);}});
    const expected=Array.isArray(d.expectedIncome)?d.expectedIncome.filter(x=>x&&!x.received&&!x.cancelled&&dateOnly(x.date)&&dateOnly(x.date)>=today&&dateOnly(x.date)<=end):[];
    const expectedIncome=sum(expected,x=>x.amount)+sum(pendingTx.filter(x=>x.type==='income'&&x.date&&dateOnly(x.date)&&dateOnly(x.date)>=today&&dateOnly(x.date)<=end),x=>x.amount);
    const actualDailyTx=posted.filter(x=>x.type==='expense'&&!x.billId&&!x.billTransactionId&&(!x.date||!dateOnly(x.date)||dateOnly(x.date)>=start&&dateOnly(x.date)<=today));
    const discretionarySpent=sum(actualDailyTx,x=>x.amount);
    const elapsedSafe=Math.max(1,Math.min(days,elapsed+1));
    const dailyActual=discretionarySpent/elapsedSafe;
    const plannedDaily=budget/days;
    const daily=remaining>0?Math.max(0,spendable/remaining):0;
    const futurePace=dailyActual*remaining;
    const projected=Math.round((balance+expectedIncome-pendingOutflows-forecastCommitments-futurePace)*100)/100;
    const essentialCoverage=balance>=essential;
    const risk=balance<0||spendable<0||projected<0||!essentialCoverage?'High risk':(remaining>0&&dailyActual>daily*1.2)||spendable<plannedDaily*remaining*.35?'Caution':'Healthy';
    const cashScore=25*clamp(spendable/Math.max(1,budget),0,1);
    const forecastScore=35*(projected>=0?1:clamp(1+projected/Math.max(1,budget),0,1));
    const essentialsScore=essential===0?25:25*clamp(balance/Math.max(1,essential),0,1);
    const paceScore=15*clamp(1-dailyActual/Math.max(1,plannedDaily*1.5),0,1);
    const score=Math.round(clamp(cashScore+forecastScore+essentialsScore+paceScore,0,100));
    const goalProgress=goals.length?Math.round(goals.reduce((s,g)=>s+clamp(n(g.saved)/Math.max(1,n(g.target)),0,1),0)/goals.length*100):0;
    const runway=dailyActual>0?Math.floor(Math.max(0,spendable)/dailyActual):null;
    return {income,spent,balance,unpaid,committed,savings,spendable,pendingOutflows,remaining,daily,plannedDaily,upcoming,projected,essential,essentialCoverage,risk,goalProgress,score,dailyActual,elapsed,forecastCommitments,expectedIncome,recurringMonthly,runway};
  }
  function validateState(raw, defaults){
    const d=raw&&typeof raw==='object'?raw:{};
    const validRows=(key)=>Array.isArray(d[key])?d[key].filter(x=>x&&typeof x==='object').map(x=>({...x})).slice(0,5000):defaults[key];
    return {...defaults,...d,
      budget:Number.isFinite(Number(d.budget))&&Number(d.budget)>=0?Math.round(Number(d.budget)*100)/100:defaults.budget,
      days:Number.isFinite(Number(d.days))&&Number(d.days)>=1?Math.min(365,Math.floor(Number(d.days))):defaults.days,
      transactions:validRows('transactions').filter(x=>Number.isFinite(Number(x.amount))&&Number(x.amount)>=0&&['income','expense','adjustment'].includes(x.type)),
      bills:validRows('bills').filter(x=>Number.isFinite(Number(x.amount))&&Number(x.amount)>=0),
      goals:validRows('goals').filter(x=>Number.isFinite(Number(x.target))&&Number(x.target)>0&&Number.isFinite(Number(x.saved))&&Number(x.saved)>=0),
      expectedIncome:validRows('expectedIncome'),
      lang:['English','Tamil','Hindi','Telugu','Malayalam','Bengali'].includes(d.lang)?d.lang:defaults.lang,
      theme:['system','light','dark'].includes(d.theme)?d.theme:defaults.theme
    };
  }
  window.BarelyFinance={calculate,validateState,amount:n,dayKey};
})();
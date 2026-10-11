(function(){
  "use strict";
  const DB_NAME="barely-finance-db";
  const DB_VERSION=1;
  const LEGACY_KEY="barely-state-v1";
  const META_KEY="barely-state-v2";
  let db=null, persistent=true, lastTransactions=[], orderById=new Map(), nextOrder=0, queue=Promise.resolve(), lastResult={ok:true}, ready=false;

  function parseStored(key){
    try{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):null;}
    catch(error){const e=new Error("Saved data could not be read. Your existing browser snapshot was left untouched.");e.cause=error;throw e;}
  }
  function openDb(){
    if(db)return Promise.resolve(db);
    if(!window.indexedDB)return Promise.reject(new Error("IndexedDB is unavailable in this browser."));
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open(DB_NAME,DB_VERSION);
      request.onupgradeneeded=()=>{
        const opened=request.result;
        if(!opened.objectStoreNames.contains("transactions")){
          const store=opened.createObjectStore("transactions",{keyPath:"id"});
          store.createIndex("by_date","date",{unique:false});
          store.createIndex("by_type","type",{unique:false});
          store.createIndex("by_category","category",{unique:false});
          store.createIndex("by_type_date",["type","date"],{unique:false});
          store.createIndex("by_category_date",["category","date"],{unique:false});
        }
      };
      request.onsuccess=()=>{db=request.result;db.onversionchange=()=>{db.close();db=null};resolve(db)};
      request.onerror=()=>reject(request.error||new Error("Could not open browser transaction storage."));
      request.onblocked=()=>reject(new Error("Browser storage is busy in another tab. Close older barely. tabs and retry."));
    });
  }
  function allTransactions(database){
    return new Promise((resolve,reject)=>{
      const tx=database.transaction("transactions","readonly");
      const req=tx.objectStore("transactions").getAll();
      req.onsuccess=()=>resolve(req.result||[]);
      req.onerror=()=>reject(req.error||new Error("Could not read saved transactions."));
      tx.onabort=()=>reject(tx.error||new Error("Reading transaction storage was interrupted."));
    });
  }
  function replaceTransactions(database,rows){
    return new Promise((resolve,reject)=>{
      const tx=database.transaction("transactions","readwrite");
      const store=tx.objectStore("transactions");
      store.clear();
      rows.forEach(row=>store.put(row));
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error||new Error("Could not save the transaction migration."));
      tx.onabort=()=>reject(tx.error||new Error("Transaction migration was interrupted; the old snapshot remains available."));
    });
  }
  function applyChanges(database,puts,deletes){
    if(!puts.length&&!deletes.length)return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const tx=database.transaction("transactions","readwrite");
      const store=tx.objectStore("transactions");
      puts.forEach(row=>store.put(row));
      deletes.forEach(id=>store.delete(id));
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error||new Error("Could not save transaction changes."));
      tx.onabort=()=>reject(tx.error||new Error("Transaction changes were interrupted."));
    });
  }
  function countRows(database){
    return new Promise((resolve,reject)=>{
      const tx=database.transaction("transactions","readonly");
      const req=tx.objectStore("transactions").count();
      req.onsuccess=()=>resolve(req.result||0);
      req.onerror=()=>reject(req.error||new Error("Could not verify stored transaction count."));
    });
  }
  function cleanMeta(data){
    const meta={...data};
    delete meta.transactions;delete meta.storageMode;delete meta.transactionCount;delete meta.nextOrder;delete meta.updatedAt;
    return meta;
  }
  function saveMeta(data,count){
    const meta={...cleanMeta(data),storageMode:"indexeddb-v1",transactionCount:count,nextOrder,updatedAt:new Date().toISOString()};
    try{localStorage.setItem(META_KEY,JSON.stringify(meta));}
    catch(error){const e=new Error("Transactions may be stored, but preferences could not be saved. Free browser storage space and retry.");e.cause=error;throw e;}
  }
  function ordered(rows){
    orderById=new Map();
    rows.forEach((row,index)=>{
      if(!Number(row.__barelyOrder))row.__barelyOrder=rows.length-index;
      orderById.set(String(row.id),Number(row.__barelyOrder)||0);
    });
    rows.sort((a,b)=>(Number(b.__barelyOrder)||0)-(Number(a.__barelyOrder)||0));
    nextOrder=rows.reduce((m,x)=>Math.max(m,Number(x.__barelyOrder)||0),0);
    return rows;
  }
  function withStableIds(data){
    const seen=new Set();
    const rows=(Array.isArray(data.transactions)?data.transactions:[]).map((row,i)=>{
      let id=String(row.id||("legacy-tx-"+i)).trim()||("legacy-tx-"+i);
      const base=id;let suffix=1;
      while(seen.has(id))id=base+"-duplicate-"+suffix++;
      seen.add(id);
      return {...row,id,amount:Math.round(Number(row.amount)*100)/100,__barelyOrder:Number(row.__barelyOrder)||0};
    });
    data.transactions=rows;
    return rows;
  }
  async function initialize(defaults,validate){
    const metaRaw=parseStored(META_KEY);
    let database;
    try{database=await openDb();}
    catch(error){
      if(metaRaw&&metaRaw.storageMode==="indexeddb-v1")throw error;
      const old=parseStored(LEGACY_KEY);
      const data=validate(old||defaults,defaults);
      persistent=false;ready=true;lastTransactions=data.transactions;
      return {data,persistent:false,migrated:false,warning:"Persistent browser storage is unavailable. You can view and edit this session, but changes may be lost on refresh."};
    }
    if(metaRaw&&metaRaw.storageMode==="indexeddb-v1"){
      const rows=ordered(await allTransactions(database));
      const meta=cleanMeta(metaRaw);
      const data=validate({...meta,transactions:[]},defaults);
      data.transactions=rows;
      lastTransactions=rows;ready=true;persistent=true;
      // Repair stale counts after an interrupted metadata write; never discard the primary IndexedDB records.
      if(Number(metaRaw.transactionCount)!==rows.length){saveMeta(data,rows.length);}
      return {data,persistent:true,migrated:false,warning:""};
    }
    // First migration: never overwrite/remove the original localStorage snapshot.
    const old=parseStored(LEGACY_KEY);
    const source=validate(old||defaults,defaults);
    const rows=withStableIds(source);
    rows.forEach((row,index)=>{if(!row.__barelyOrder)row.__barelyOrder=rows.length-index;});
    await replaceTransactions(database,rows);
    const storedCount=await countRows(database);
    if(storedCount!==rows.length)throw new Error("Transaction migration verification failed. The original browser snapshot is still preserved; retry without clearing site data.");
    const stored=ordered(await allTransactions(database));
    const ids=new Set(stored.map(x=>x.id));
    if(stored.length!==rows.length||rows.some(x=>!ids.has(x.id)))throw new Error("Transaction migration verification failed. The original browser snapshot is still preserved; retry without clearing site data.");
    source.transactions=stored;
    nextOrder=Math.max(nextOrder,stored.length);
    saveMeta(source,stored.length);
    lastTransactions=stored;ready=true;persistent=true;
    return {data:source,persistent:true,migrated:!!old,warning:""};
  }
  function persistOne(data){
    if(!ready)return Promise.reject(new Error("Transaction storage has not finished initializing."));
    if(!persistent)return Promise.resolve({ok:false,message:"Persistent browser storage is unavailable. Changes are not guaranteed to survive refresh."});
    const transactions=Array.isArray(data.transactions)?data.transactions:[];
    const previous=lastTransactions;
    if(transactions!==previous){
      const oldById=new Map(previous.map(x=>[String(x.id),x]));
      const currentIds=new Set();
      const puts=[];
      for(const row of transactions){
        const id=String(row.id||"");
        if(!id)throw new Error("A transaction is missing its stable ID; the change was not saved.");
        currentIds.add(id);
        const old=oldById.get(id);
        if(!old||old!==row){
          let order=orderById.get(id)||Number(old&&old.__barelyOrder)||Number(row.__barelyOrder)||0;
          if(!order)order=++nextOrder;
          puts.push({...row,__barelyOrder:order});
        }
      }
      const deletes=[];
      for(const row of previous)if(!currentIds.has(String(row.id)))deletes.push(String(row.id));
      return openDb().then(database=>applyChanges(database,puts,deletes)).then(async()=>{
        const actual=await countRows(db);
        if(actual!==transactions.length)throw new Error("Saved transaction count did not match the current record count. Retry and keep this tab open.");
        lastTransactions=transactions;
        puts.forEach(row=>orderById.set(String(row.id),Number(row.__barelyOrder)||0));
        deletes.forEach(id=>orderById.delete(id));
        saveMeta(data,actual);
        return {ok:true,count:actual};
      });
    }
    saveMeta(data,transactions.length);
    return Promise.resolve({ok:true,count:transactions.length});
  }
  function persist(data){
    const task=queue.catch(()=>{}).then(()=>persistOne(data)).then(result=>{lastResult=result||{ok:true};return result},error=>{lastResult={ok:false,message:error&&error.message||"Could not finish saving."};throw error});
    queue=task;
    return task;
  }
  function flush(){return queue.then(()=>lastResult,error=>({ok:false,message:error&&error.message||"Could not finish saving."}));}
  async function clearLegacyBackup(){
    if(!ready||!persistent)return {ok:false,message:"The legacy snapshot was kept because persistent storage is unavailable."};
    const database=await openDb(),count=await countRows(database),meta=parseStored(META_KEY);
    if(count!==0||Number(meta&&meta.transactionCount)!==0)return {ok:false,message:"The legacy snapshot was kept because saved transactions still exist."};
    try{localStorage.removeItem(LEGACY_KEY);return {ok:true};}
    catch(error){return {ok:false,message:"The reset was saved, but the older recovery snapshot could not be removed."};}
  }
  window.BarelyStorage={initialize,persist,flush,clearLegacyBackup,getReady:()=>ready,getPersistent:()=>persistent};
})();
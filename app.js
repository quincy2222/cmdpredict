// ═══════════════════════════════════════════════════
// CMDpredict v4 — Activity ledger, user profiles, admin CRUD
// ═══════════════════════════════════════════════════

const ADMINS=["quincy m.","quincy mcdougal","admin"];
const ANALYSTS=["Constantine","Luca","James","Quincy","Phil"];
// Comprehensive alias map: lowercase variant → canonical analyst name
const ALIASES={
  // Phil variants
  "phil":"Phil","philip":"Phil","phillip":"Phil","phillipe":"Phil","felipe":"Phil","pip":"Phil",
  // Constantine variants
  "constantine":"Constantine","const":"Constantine","con":"Constantine","tino":"Constantine","costas":"Constantine","gus":"Constantine","dino":"Constantine",
  // Luca variants
  "luca":"Luca","luka":"Luca","luke":"Luca","lucca":"Luca",
  // James variants
  "james":"James","jamie":"James","jim":"James","jimmy":"James","jem":"James",
  // Quincy variants
  "quincy":"Quincy","quince":"Quincy","quin":"Quincy","quinn":"Quincy"
};
function matchAnalyst(input){
  if(!input)return null;
  const low=input.trim().toLowerCase();
  // 1. Direct alias match
  if(ALIASES[low])return ALIASES[low];
  // 2. Check if input matches any analyst name (case-insensitive)
  const exact=ANALYSTS.find(a=>a.toLowerCase()===low);
  if(exact)return exact;
  // 3. Check if any analyst name STARTS with input (e.g. "con" → Constantine)
  const starts=ANALYSTS.find(a=>a.toLowerCase().startsWith(low)&&low.length>=3);
  if(starts)return starts;
  // 4. Check if input starts with any analyst name
  const revStarts=ANALYSTS.find(a=>low.startsWith(a.toLowerCase()));
  if(revStarts)return revStarts;
  // 5. Check if any alias starts with input or input starts with alias
  for(const[alias,name]of Object.entries(ALIASES)){
    if(alias.startsWith(low)&&low.length>=3)return name;
    if(low.startsWith(alias))return name;
  }
  // 6. Fuzzy: check if input contains an analyst name or vice versa
  const contains=ANALYSTS.find(a=>low.includes(a.toLowerCase())||a.toLowerCase().includes(low));
  if(contains&&low.length>=3)return contains;
  return null;
}
function canonicalName(name){return matchAnalyst(name)||name}
const START_BAL=10000;
const CATS=["All","Macro","Deals","Articles","Employees","Other"];
const CI={Macro:"🌍",Deals:"🤝",Articles:"📝",Employees:"👥",Other:"🔮"};
const T="#1B8A9E",TD="#156F80",TL="#E8F6F8",GN="#10B981",RD="#EF4444",AMBER="#F59E0B";

const FIREBASE_CONFIG={
  apiKey:"AIzaSyDra0iY_fPwjdgAPWf-JQr8H6ETmUQUaMg",
  authDomain:"cmdpredict.firebaseapp.com",
  databaseURL:"https://cmdpredict-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:"cmdpredict",
  storageBucket:"cmdpredict.firebasestorage.app",
  messagingSenderId:"1084863694257",
  appId:"1:1084863694257:web:7bbb348da2e5deb5eb2990",
  measurementId:"G-CTXJ4M7FYC"
};

let db=null,useFirebase=false;
try{if(FIREBASE_CONFIG.apiKey){firebase.initializeApp(FIREBASE_CONFIG);db=firebase.database();useFirebase=true}}catch(e){console.warn("FB fail",e)}

// ── STATE ──
let S={
  markets:[],trades:[],users:{},seasons:[],currentSeason:null,
  portfolio:{balance:START_BAL,positions:[]},
  name:(function(){const n=localStorage.getItem('cmdp_name');return n&&matchAnalyst(n)?matchAnalyst(n):''}()),nameIn:'',
  view:'markets',cat:'All',sort:'newest',q:'',
  sel:null,selOc:0,side:'yes',amt:'',
  creating:false,editing:null,resolving:null,adminPanel:false,
  addFundsUser:null,addFundsAmt:'',
  // User profile modal (visible to everyone)
  viewingUser:null,
  // Admin: add new user modal
  addingUser:false,newUserName:'',newUserBalance:String(START_BAL),
  // Admin: editing balance inline
  editingBalance:null,editBalanceVal:'',
  // Season admin
  endingSeasonModal:false,
  // Guest mode
  isGuest:false,
  notif:null,
  form:{title:'',desc:'',cat:'Other',end:'',outcomes:['Yes','No']},
  editForm:{outcomes:[]},
  ready:false,renderCount:0
};

function isAdmin(){return ADMINS.some(a=>a.toLowerCase()===S.name.toLowerCase())}

// ── FIREBASE INIT ──
async function init(){
  if(useFirebase){
    db.ref('markets').on('value',snap=>{
      const v=snap.val();S.markets=v?Object.values(v):[];
      if(S.sel){const f=S.markets.find(m=>m.id===S.sel.id);if(f)S.sel=f}
      render();
    });
    db.ref('trades').on('value',snap=>{
      const v=snap.val();S.trades=v?Object.values(v):[];render();
    });
    db.ref('users').on('value',snap=>{
      const v=snap.val();S.users=v||{};render();
    });
    db.ref('seasons').on('value',snap=>{
      const v=snap.val();S.seasons=v?Object.values(v):[];
      S.seasons.sort((a,b)=>b.startedAt-a.startedAt);
      S.currentSeason=S.seasons.find(s=>!s.ended)||null;
      render();
    });
  }else{
    S.markets=JSON.parse(localStorage.getItem('cmdp_markets')||'[]');
    S.trades=JSON.parse(localStorage.getItem('cmdp_trades')||'[]');
    S.users=JSON.parse(localStorage.getItem('cmdp_users')||'{}');
    S.seasons=JSON.parse(localStorage.getItem('cmdp_seasons')||'[]');
    S.seasons.sort((a,b)=>b.startedAt-a.startedAt);
    S.currentSeason=S.seasons.find(s=>!s.ended)||null;
  }
  const rp=localStorage.getItem('cmdp_portfolio');if(rp)S.portfolio=JSON.parse(rp);
  S.ready=true;render();
}

function saveMarkets(m){if(useFirebase){const o={};m.forEach(x=>{o[x.id]=x});db.ref('markets').set(o)}else localStorage.setItem('cmdp_markets',JSON.stringify(m))}
function saveTrade(t){if(useFirebase)db.ref('trades/'+t.id).set(t);else{const a=JSON.parse(localStorage.getItem('cmdp_trades')||'[]');a.push(t);localStorage.setItem('cmdp_trades',JSON.stringify(a))}}
function savePortfolio(){
  localStorage.setItem('cmdp_portfolio',JSON.stringify(S.portfolio));
  const u=S.users[encodeKey(S.name)]||S.users[S.name]||{};
  u.name=S.name;u.balance=S.portfolio.balance;u.lastSeen=Date.now();
  if(useFirebase)db.ref('users/'+encodeKey(S.name)).set(u);
  else{S.users[encodeKey(S.name)]=u;localStorage.setItem('cmdp_users',JSON.stringify(S.users))}
}
function encodeKey(k){return k.replace(/[.#$\/\[\]]/g,'_')}
function flash(msg,type='ok'){S.notif={msg,type};render();setTimeout(()=>{S.notif=null;render()},3200)}

// ── ACTIVITY LEDGER ──
// Every significant action is logged to the activity ledger in Firebase/localStorage
function logActivity(entry){
  const a={id:Date.now()+'_'+Math.random().toString(36).slice(2,6),ts:Date.now(),...entry};
  if(useFirebase){
    db.ref('activity/'+a.id).set(a);
  }else{
    const acts=JSON.parse(localStorage.getItem('cmdp_activity')||'[]');
    acts.push(a);
    localStorage.setItem('cmdp_activity',JSON.stringify(acts));
  }
}

// Load activity log
let activityLog=[];
function initActivityLog(){
  if(useFirebase){
    db.ref('activity').on('value',snap=>{
      const v=snap.val();activityLog=v?Object.values(v):[];
      activityLog.sort((a,b)=>b.ts-a.ts);
    });
  }else{
    activityLog=JSON.parse(localStorage.getItem('cmdp_activity')||'[]');
    activityLog.sort((a,b)=>b.ts-a.ts);
  }
}

// ── Get user stats from trades ──
function getUserStats(userName){
  const canonical=canonicalName(userName);
  const userTrades=S.trades.filter(t=>canonicalName(t.who)===canonical);
  let totalVolume=0,totalPnl=0,wins=0,losses=0;
  const tradeDetails=[];

  userTrades.forEach(t=>{
    totalVolume+=(t.amount||0);
    const mk=S.markets.find(m=>m.id===t.mid);
    let cur=t.avg,pnl=0,status='open';
    if(mk&&mk.outcomes[t.outcomeIdx]){
      if(mk.resolved){
        const won=(t.side==='yes'&&t.outcomeIdx===mk.winnerIdx)||(t.side==='no'&&t.outcomeIdx!==mk.winnerIdx);
        if(mk.cancelled){
          pnl=0;status='cancelled';
        }else if(won){
          pnl=t.shares-t.amount;wins++;status='won';
        }else{
          pnl=-t.amount;losses++;status='lost';
        }
      }else{
        cur=t.side==='yes'?mk.outcomes[t.outcomeIdx].price:(1-mk.outcomes[t.outcomeIdx].price);
        pnl=(cur-t.avg)*t.shares;
        status='open';
      }
    }
    totalPnl+=pnl;
    tradeDetails.push({...t,currentPrice:cur,pnl,status,marketTitle:t.title||mk?.title||'Unknown'});
  });

  tradeDetails.sort((a,b)=>b.ts-a.ts);
  return{trades:tradeDetails,totalVolume,totalPnl,wins,losses,totalTrades:userTrades.length};
}

// ── AMM (Independent Binary Outcomes) ──
// Each outcome is its own independent YES/NO market.
// Prices do NOT need to sum to 100% across outcomes.
// Each outcome has a pool value; price = sigmoid of pool bias.
// This means "By 15/3 YES at 70¢" does NOT force "By 31/3" down.

function outcomePrice(pool, b){
  // Sigmoid: price = 1 / (1 + e^(-pool/b))
  // When pool=0, price=50¢. Buying YES pushes pool up (price up). Buying NO pushes pool down.
  const p = 1 / (1 + Math.exp(-(pool||0)/b));
  return Math.max(.01, Math.min(.99, Math.round(p*100)/100));
}

function outcomeCost(pool, shares, side, b){
  // Cost to move the pool by `shares` in the given direction
  // side=yes: pool increases. side=no: pool decreases.
  const dir = side==='yes' ? 1 : -1;
  const newPool = (pool||0) + dir*shares;
  // Cost = b * [ln(1+e^(newPool/b)) - ln(1+e^(pool/b))]
  // For numerical stability use log-sum-exp
  const logSumBefore = b * Math.log(1 + Math.exp((pool||0)/b));
  const logSumAfter = b * Math.log(1 + Math.exp(newPool/b));
  return Math.abs(logSumAfter - logSumBefore);
}

function cpmmBuy(market, oi, side, amount){
  const m=JSON.parse(JSON.stringify(market));
  const b=m.liquidity?m.liquidity*1.5:1500;

  // Binary search for how many shares `amount` buys on this outcome
  let lo=0, hi=amount*20;
  for(let iter=0;iter<60;iter++){
    const mid=(lo+hi)/2;
    const cost=outcomeCost(m.outcomes[oi].pool||0, mid, side, b);
    if(cost<amount) lo=mid; else hi=mid;
  }
  const shares=Math.round(lo*100)/100;

  // Apply pool change (only to THIS outcome)
  const dir = side==='yes' ? 1 : -1;
  m.outcomes[oi].pool = (m.outcomes[oi].pool||0) + dir*shares;

  // Recalculate price ONLY for the traded outcome
  m.outcomes[oi].price = outcomePrice(m.outcomes[oi].pool, b);
  m.outcomes[oi].history = [...(m.outcomes[oi].history||[m.outcomes[oi].price]), m.outcomes[oi].price];

  m.volume=(m.volume||0)+amount;
  m.traders=(m.traders||0)+1;

  const avgPrice=shares>0?Math.round((amount/shares)*100)/100:0;
  return {market:m, shares, avgPrice};
}

function cpmmSell(market, oi, side, shares){
  const m=JSON.parse(JSON.stringify(market));
  const b=m.liquidity?m.liquidity*1.5:1500;

  // Selling = reversing the pool direction
  const sellSide = side==='yes' ? 'no' : 'yes';
  const saleValue=Math.round(outcomeCost(m.outcomes[oi].pool||0, shares, sellSide, b)*100)/100;

  // Apply reverse pool change
  const dir = side==='yes' ? -1 : 1;
  m.outcomes[oi].pool = (m.outcomes[oi].pool||0) + dir*shares;

  // Recalculate price ONLY for the sold outcome
  m.outcomes[oi].price = outcomePrice(m.outcomes[oi].pool, b);
  m.outcomes[oi].history = [...(m.outcomes[oi].history||[m.outcomes[oi].price]), m.outcomes[oi].price];

  m.volume=(m.volume||0)+saleValue;

  return {market:m, saleValue};
}

// ── ACTIONS ──
function confirmName(){
  if(!S.nameIn.trim())return;
  const matched=matchAnalyst(S.nameIn.trim());
  if(!matched){
    flash("Access restricted to team analysts only.","err");
    return;
  }
  S.name=matched;localStorage.setItem('cmdp_name',S.name);
  // Sync balance from Firebase if available
  const key=encodeKey(S.name);
  if(useFirebase){
    db.ref('users/'+key).once('value',snap=>{
      const u=snap.val();
      if(u&&u.balance!=null){
        S.portfolio.balance=u.balance;
      }
      savePortfolio();
      logActivity({type:'join',user:S.name,desc:`${S.name} joined CMDpredict`});
      checkPayouts();
      render();
    });
  }else{
    savePortfolio();
    logActivity({type:'join',user:S.name,desc:`${S.name} joined CMDpredict`});
    render();
  }
}

function enterGuest(){
  const pw=prompt('Enter guest password:');
  if(pw!=='cmd2026'){flash("Incorrect password.","err");return}
  S.name='Guest';S.isGuest=true;S.view='markets';render();
}

function createMarket(){
  const f=S.form;
  if(!f.title||!f.end){flash("Title and end date required","err");return}
  const labels=f.outcomes.filter(o=>o.trim());
  if(labels.length<2){flash("Need at least 2 outcomes","err");return}
  const m={id:Date.now(),title:f.title,description:f.desc||"No resolution criteria specified.",category:f.cat,endDate:f.end,creator:S.name,
    outcomes:labels.map(l=>({label:l,price:.5,pool:0,history:[.5]})),
    volume:0,liquidity:1000,traders:0,resolved:false,winnerIdx:null,createdAt:new Date().toISOString()};
  S.markets=[m,...S.markets];saveMarkets(S.markets);
  logActivity({type:'market_created',user:S.name,marketId:m.id,desc:`${S.name} created market: "${f.title}"`});
  S.creating=false;S.form={title:'',desc:'',cat:'Other',end:'',outcomes:['Yes','No']};
  flash("Market created!");
}

function trade(){
  const a=parseFloat(S.amt);
  if(!a||a<=0){flash("Enter a valid amount","err");return}
  if(a>S.portfolio.balance){flash("Insufficient balance","err");return}
  if(S.sel.resolved){flash("Market is resolved","err");return}
  const oc=S.sel.outcomes[S.selOc];
  const result=cpmmBuy(S.sel,S.selOc,S.side,a);
  const updated=result.market, shares=result.shares, avgPrice=result.avgPrice;
  if(shares<=0){flash("Trade too small","err");return}
  const rec={id:Date.now(),mid:S.sel.id,outcomeIdx:S.selOc,outcomeLabel:oc.label,
    side:S.side,shares,avg:avgPrice,title:S.sel.title,who:S.name,amount:a,ts:Date.now()};
  saveTrade(rec);
  S.portfolio.balance=Math.round((S.portfolio.balance-a)*100)/100;
  S.portfolio.positions.push(rec);savePortfolio();
  S.markets=S.markets.map(m=>m.id!==S.sel.id?m:updated);saveMarkets(S.markets);
  S.sel=updated;S.amt='';
  logActivity({type:'trade',user:S.name,marketId:S.sel.id,amount:a,side:S.side,outcome:oc.label,
    desc:`${S.name} bought ${shares} ${S.side.toUpperCase()} "${oc.label}" at ${Math.round(avgPrice*100)}¢ for $${a}`});
  flash(`Bought ${shares} ${S.side.toUpperCase()} "${oc.label}" at ${Math.round(avgPrice*100)}¢`);
}

function sellPosition(posIdx){
  const pos=S.portfolio.positions[posIdx];
  if(!pos){flash("Position not found","err");return}
  const mk=S.markets.find(m=>m.id===pos.mid);
  if(!mk||mk.resolved){flash("Cannot sell — market resolved","err");return}

  const result=cpmmSell(mk, pos.outcomeIdx, pos.side, pos.shares);
  const updated=result.market, saleValue=result.saleValue;

  if(saleValue<=0){flash("No sale value","err");return}

  // Remove position from local portfolio
  S.portfolio.positions.splice(posIdx,1);
  S.portfolio.balance=Math.round((S.portfolio.balance+saleValue)*100)/100;
  savePortfolio();

  // Update market
  S.markets=S.markets.map(m=>m.id!==mk.id?m:updated);saveMarkets(S.markets);
  if(S.sel&&S.sel.id===mk.id) S.sel=updated;

  // Log as a sell trade
  const sellRec={id:Date.now(),mid:mk.id,outcomeIdx:pos.outcomeIdx,outcomeLabel:pos.outcomeLabel,
    side:pos.side,shares:-pos.shares,avg:pos.avg,title:mk.title,who:S.name,amount:-saleValue,ts:Date.now(),isSell:true};
  saveTrade(sellRec);

  logActivity({type:'trade',user:S.name,marketId:mk.id,amount:saleValue,side:'sell',outcome:pos.outcomeLabel,
    desc:`${S.name} sold ${pos.shares} ${pos.side.toUpperCase()} "${pos.outcomeLabel}" for $${saleValue}`});
  flash(`Sold ${pos.shares} ${pos.side.toUpperCase()} "${pos.outcomeLabel}" for $${saleValue}`);
}

function saveEdit(){
  const ef=S.editForm,labels=ef.outcomes.filter(o=>o.trim());
  if(labels.length<2){flash("Need at least 2 outcomes","err");return}
  const m=S.markets.find(x=>x.id===S.editing.id);if(!m)return;
  const u=JSON.parse(JSON.stringify(m));
  const b=u.liquidity?u.liquidity*1.5:1500;
  u.outcomes=labels.map(label=>{
    const ex=u.outcomes.find(o=>o.label===label);
    if(ex)return ex; // Keep existing outcome with its pool/price/history intact
    return{label,price:.5,pool:0,history:[.5]}; // New outcome starts at 50%
  });
  if(ef.title)u.title=ef.title;if(ef.desc)u.description=ef.desc;if(ef.end)u.endDate=ef.end;
  S.markets=S.markets.map(x=>x.id===u.id?u:x);saveMarkets(S.markets);
  S.editing=null;S.sel=u;flash("Market updated!");
}

// ── RESOLVE WITH PAYOUT ──
function resolveMarket(winnerIdx){
  const m=S.markets.find(x=>x.id===S.resolving.id);if(!m)return;
  const u=JSON.parse(JSON.stringify(m));
  u.resolved=true;u.winnerIdx=winnerIdx;u.resolvedAt=new Date().toISOString();u.resolvedBy=S.name;
  u.outcomes.forEach((o,i)=>{o.price=i===winnerIdx?1:0;o.history=[...(o.history||[]),o.price]});
  S.markets=S.markets.map(x=>x.id===u.id?u:x);saveMarkets(S.markets);

  // Calculate payouts per user from ALL trades on this market
  const payoutsByUser={};
  S.trades.forEach(t=>{
    if(t.mid!==u.id||t.isSell)return;
    const won=(t.side==='yes'&&t.outcomeIdx===winnerIdx)||(t.side==='no'&&t.outcomeIdx!==winnerIdx);
    if(!payoutsByUser[t.who])payoutsByUser[t.who]=0;
    if(won)payoutsByUser[t.who]+=t.shares;
  });

  // Directly update each user's balance in Firebase — no IOUs
  Object.entries(payoutsByUser).forEach(([who,amt])=>{
    if(amt<=0)return;
    const rounded=Math.round(amt*100)/100;
    const key=encodeKey(who);
    if(useFirebase){
      db.ref('users/'+key).once('value',snap=>{
        const userData=snap.val()||{name:who,balance:START_BAL};
        userData.balance=Math.round((userData.balance+rounded)*100)/100;
        db.ref('users/'+key).set(userData);
      });
    }else{
      const userData=S.users[key]||{name:who,balance:START_BAL};
      userData.balance=Math.round((userData.balance+rounded)*100)/100;
      S.users[key]=userData;
      localStorage.setItem('cmdp_users',JSON.stringify(S.users));
    }
    // Update local portfolio if it's us
    if(who.toLowerCase()===S.name.toLowerCase()){
      S.portfolio.balance=Math.round((S.portfolio.balance+rounded)*100)/100;
      savePortfolio();
    }
  });

  logActivity({type:'resolve',user:S.name,marketId:u.id,winner:u.outcomes[winnerIdx].label,
    desc:`${S.name} resolved "${u.title}" → ${u.outcomes[winnerIdx].label} wins`});

  S.resolving=null;S.sel=u;
  const payoutSummary=Object.entries(payoutsByUser).filter(([,a])=>a>0).map(([who,amt])=>`${who}: +$${Math.round(amt)}`).join(', ');
  flash(`Resolved! ${payoutSummary||'No payouts.'}`);
}

function cancelMarket(){
  const m=S.markets.find(x=>x.id===S.resolving.id);if(!m)return;
  const u=JSON.parse(JSON.stringify(m));
  u.resolved=true;u.cancelled=true;u.resolvedAt=new Date().toISOString();u.resolvedBy=S.name;
  S.markets=S.markets.map(x=>x.id===u.id?u:x);saveMarkets(S.markets);

  // Calculate refunds per user from ALL trades
  const refundsByUser={};
  S.trades.forEach(t=>{
    if(t.mid!==u.id||t.isSell)return;
    if(!refundsByUser[t.who])refundsByUser[t.who]=0;
    refundsByUser[t.who]+=(t.amount||0);
  });

  // Directly update each user's balance
  Object.entries(refundsByUser).forEach(([who,amt])=>{
    if(amt<=0)return;
    const rounded=Math.round(amt*100)/100;
    const key=encodeKey(who);
    if(useFirebase){
      db.ref('users/'+key).once('value',snap=>{
        const userData=snap.val()||{name:who,balance:START_BAL};
        userData.balance=Math.round((userData.balance+rounded)*100)/100;
        db.ref('users/'+key).set(userData);
      });
    }else{
      const userData=S.users[key]||{name:who,balance:START_BAL};
      userData.balance=Math.round((userData.balance+rounded)*100)/100;
      S.users[key]=userData;
      localStorage.setItem('cmdp_users',JSON.stringify(S.users));
    }
    if(who.toLowerCase()===S.name.toLowerCase()){
      S.portfolio.balance=Math.round((S.portfolio.balance+rounded)*100)/100;
      savePortfolio();
    }
  });

  logActivity({type:'cancel',user:S.name,marketId:u.id,desc:`${S.name} cancelled "${u.title}" — all refunded`});
  S.resolving=null;S.sel=u;flash("Market cancelled. Refunds distributed.");
}

function deleteMarket(id){
  const m=S.markets.find(x=>x.id===id);
  S.markets=S.markets.filter(x=>x.id!==id);saveMarkets(S.markets);
  if(useFirebase)db.ref('markets/'+id).remove();
  logActivity({type:'delete_market',user:S.name,marketId:id,desc:`${S.name} deleted market "${m?.title||id}"`});
  S.sel=null;S.resolving=null;S.editing=null;flash("Market deleted.");
}

// ── Sync balance from Firebase (source of truth) + claim any legacy IOUs ──
function checkPayouts(){
  if(!useFirebase||!S.name)return;
  const key=encodeKey(S.name);

  // First: claim any legacy unclaimed IOUs from old payout system
  db.ref('payouts').once('value',snap=>{
    const all=snap.val();if(!all)return;
    let legacyPayout=0;
    Object.entries(all).forEach(([k,p])=>{
      if(p.who===S.name&&!p.claimed){
        legacyPayout+=p.amount;
        db.ref('payouts/'+k+'/claimed').set(true);
      }
    });
    if(legacyPayout>0){
      // Add legacy payouts to Firebase balance
      db.ref('users/'+key).once('value',snap2=>{
        const u=snap2.val()||{name:S.name,balance:START_BAL};
        u.balance=Math.round((u.balance+legacyPayout)*100)/100;
        db.ref('users/'+key).set(u);
        S.portfolio.balance=u.balance;
        savePortfolio();
        flash(`Claimed $${Math.round(legacyPayout)} in unclaimed payouts!`);
      });
    }
  });

  // Second: sync local balance with Firebase (Firebase is source of truth)
  db.ref('users/'+key).once('value',snap=>{
    const u=snap.val();
    if(u&&u.balance!=null){
      S.portfolio.balance=u.balance;
      savePortfolio();
    }
  });
}

// ── Admin: add funds to a user ──
function adminAddFunds(){
  const amt=parseFloat(S.addFundsAmt);
  const who=S.addFundsUser;
  if(!amt||!who){flash("Enter amount","err");return}
  const key=encodeKey(who);
  if(useFirebase){
    db.ref('users/'+key).once('value',snap=>{
      const u=snap.val()||{name:who,balance:10000};
      u.balance=Math.round((u.balance+amt)*100)/100;
      db.ref('users/'+key).set(u);
      db.ref('payouts/admin_'+Date.now()+'_'+key).set({
        mid:0,who,amount:amt,marketTitle:'Admin top-up by '+S.name,winner:'TOP-UP',ts:Date.now(),claimed:false
      });
      logActivity({type:'admin_funds',user:S.name,target:who,amount:amt,desc:`${S.name} added $${amt} to ${who}'s balance`});
      flash(`Added $${amt} to ${who}'s balance`);
      S.addFundsUser=null;S.addFundsAmt='';render();
    });
  }else{
    const u=S.users[key]||S.users[who]||{name:who,balance:10000};
    u.balance=Math.round((u.balance+amt)*100)/100;
    S.users[key]=u;localStorage.setItem('cmdp_users',JSON.stringify(S.users));
    if(who===S.name){S.portfolio.balance=u.balance;savePortfolio()}
    logActivity({type:'admin_funds',user:S.name,target:who,amount:amt,desc:`${S.name} added $${amt} to ${who}'s balance`});
    flash(`Added $${amt} to ${who}'s balance`);
    S.addFundsUser=null;S.addFundsAmt='';render();
  }
}

// ── Admin: set balance directly ──
function adminSetBalance(who,newBalance){
  const key=encodeKey(who);
  const bal=Math.round(parseFloat(newBalance)*100)/100;
  if(isNaN(bal)){flash("Invalid balance","err");return}
  if(useFirebase){
    db.ref('users/'+key).once('value',snap=>{
      const u=snap.val()||{name:who,balance:10000};
      const oldBal=u.balance;
      u.balance=bal;
      db.ref('users/'+key).set(u);
      if(who===S.name){S.portfolio.balance=bal;savePortfolio()}
      logActivity({type:'admin_set_balance',user:S.name,target:who,oldBalance:oldBal,newBalance:bal,
        desc:`${S.name} set ${who}'s balance from $${oldBal} to $${bal}`});
      flash(`Set ${who}'s balance to $${bal}`);
      S.editingBalance=null;render();
    });
  }else{
    const u=S.users[key]||S.users[who]||{name:who,balance:10000};
    const oldBal=u.balance;
    u.balance=bal;
    S.users[key]=u;localStorage.setItem('cmdp_users',JSON.stringify(S.users));
    if(who===S.name){S.portfolio.balance=bal;savePortfolio()}
    logActivity({type:'admin_set_balance',user:S.name,target:who,oldBalance:oldBal,newBalance:bal,
      desc:`${S.name} set ${who}'s balance from $${oldBal} to $${bal}`});
    flash(`Set ${who}'s balance to $${bal}`);
    S.editingBalance=null;render();
  }
}

// ── Admin: delete a user ──
function adminDeleteUser(who){
  if(!confirm(`Delete user "${who}"? This removes their profile but not their trade history.`))return;
  const key=encodeKey(who);
  if(useFirebase){
    db.ref('users/'+key).remove();
  }else{
    delete S.users[key];
    delete S.users[who];
    localStorage.setItem('cmdp_users',JSON.stringify(S.users));
  }
  logActivity({type:'admin_delete_user',user:S.name,target:who,desc:`${S.name} deleted user "${who}"`});
  flash(`Deleted user "${who}"`);
  render();
}

// ── Admin: add a new user ──
function adminAddUser(){
  const name=S.newUserName.trim();
  const bal=parseFloat(S.newUserBalance)||10000;
  if(!name){flash("Enter a name","err");return}
  const key=encodeKey(name);
  const existing=S.users[key];
  if(existing){flash("User already exists","err");return}
  const u={name,balance:bal,lastSeen:Date.now()};
  if(useFirebase){
    db.ref('users/'+key).set(u);
  }else{
    S.users[key]=u;localStorage.setItem('cmdp_users',JSON.stringify(S.users));
  }
  logActivity({type:'admin_add_user',user:S.name,target:name,balance:bal,desc:`${S.name} added user "${name}" with $${bal}`});
  flash(`Added user "${name}" with $${bal}`);
  S.addingUser=false;S.newUserName='';S.newUserBalance=String(START_BAL);render();
}

// ── SEASONS ──
function saveSeasons(){
  if(useFirebase){const o={};S.seasons.forEach(s=>{o[s.id]=s});db.ref('seasons').set(o)}
  else localStorage.setItem('cmdp_seasons',JSON.stringify(S.seasons));
}

function startNewSeason(label){
  const season={id:Date.now(),number:S.seasons.length+1,label:label||'Season '+(S.seasons.length+1),startedAt:Date.now(),ended:false,endedAt:null,loser:null,standings:null};
  S.seasons.unshift(season);S.currentSeason=season;saveSeasons();
  // Reset all analyst balances
  ANALYSTS.forEach(name=>{
    const key=encodeKey(name);
    const u=S.users[key]||{name,balance:START_BAL,lastSeen:Date.now()};
    u.balance=START_BAL;
    if(useFirebase)db.ref('users/'+key).set(u);
    else S.users[key]=u;
    if(name.toLowerCase()===S.name.toLowerCase()){S.portfolio.balance=START_BAL;S.portfolio.positions=[];savePortfolio()}
  });
  if(!useFirebase)localStorage.setItem('cmdp_users',JSON.stringify(S.users));
  logActivity({type:'season_start',user:S.name,desc:`🏁 ${season.label} started! All balances reset to $${START_BAL.toLocaleString()}`});
  flash(`${season.label} started! Balances reset.`);render();
}

function endCurrentSeason(){
  if(!S.currentSeason)return;
  const standings=getLeagueTable();
  const loser=standings.length>0?standings[standings.length-1]:null;
  S.currentSeason.ended=true;S.currentSeason.endedAt=Date.now();
  S.currentSeason.loser=loser?loser.name:null;
  S.currentSeason.loserBalance=loser?loser.portfolioValue:null;
  S.currentSeason.standings=standings.map(s=>({name:s.name,portfolioValue:s.portfolioValue,pnl:s.pnl,trades:s.trades}));
  S.seasons=S.seasons.map(s=>s.id===S.currentSeason.id?S.currentSeason:s);saveSeasons();
  logActivity({type:'season_end',user:S.name,desc:`🍺 ${S.currentSeason.label} ended! ${loser?loser.name+' is buying the first round! 🍺':'No loser determined.'}`});
  S.currentSeason=null;S.endingSeasonModal=false;
  flash(loser?`${loser.name} is buying beers! 🍺`:'Season ended!');render();
}

function getLeagueTable(){
  const table=[];
  ANALYSTS.forEach(name=>{
    const key=encodeKey(name);const ui=S.users[key]||S.users[name];
    // Also check for aliased user data
    const aliasKeys=Object.entries(ALIASES).filter(([,v])=>v===name).map(([k])=>encodeKey(k));
    let bal=ui?ui.balance:START_BAL;
    if(!ui){for(const ak of aliasKeys){const au=S.users[ak];if(au){bal=au.balance;break}}}
    // Match trades by canonical name
    const ut=S.trades.filter(t=>canonicalName(t.who)===name);
    let vol=0,w=0,l=0,openValue=0;
    ut.forEach(t=>{
      if(t.isSell)return; // skip sell records
      vol+=Math.abs(t.amount||0);
      const mk=S.markets.find(m=>m.id===t.mid);
      if(mk&&mk.outcomes[t.outcomeIdx]){
        if(mk.resolved&&!mk.cancelled){
          const won=(t.side==='yes'&&t.outcomeIdx===mk.winnerIdx)||(t.side==='no'&&t.outcomeIdx!==mk.winnerIdx);
          if(won)w++;else l++;
        }else if(!mk.resolved){
          // Value open positions at current market price
          const curPrice=t.side==='yes'?mk.outcomes[t.outcomeIdx].price:(1-mk.outcomes[t.outcomeIdx].price);
          openValue+=curPrice*t.shares;
        }
      }
    });
    const portfolioValue=Math.round((bal+openValue)*100)/100;
    const pnl=Math.round((portfolioValue-START_BAL)*100)/100;
    table.push({name,portfolioValue,cashBalance:Math.round(bal*100)/100,openValue:Math.round(openValue*100)/100,pnl,volume:vol,wins:w,losses:l,trades:ut.length});
  });
  table.sort((a,b)=>b.portfolioValue-a.portfolioValue);return table;
}

function fmtDate(ts){return new Date(ts).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}
function fmtMoney(n){const a=Math.abs(n);if(a>=1000)return(n<0?'-':'')+'$'+(a/1000).toFixed(1)+'K';return(n<0?'-':'')+'$'+a.toFixed(0)}

// ── SPARKLINE ──
function spark(data,w,h,color){
  if(!data||data.length<2)return'';
  const mn=Math.min(...data)-.04,mx=Math.max(...data)+.04,rn=mx-mn||1,sx=w/(data.length-1);
  const pts=data.map((v,i)=>`${i*sx},${h-((v-mn)/rn)*h}`).join(' ');
  const areaPts=`0,${h} ${pts} ${(data.length-1)*sx},${h}`;
  const lastY=h-((data[data.length-1]-mn)/rn)*h;
  return`<svg width="100%" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="overflow:visible;display:block">
    <defs><linearGradient id="sg${w}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${color}" stop-opacity=".12"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <polygon fill="url(#sg${w})" points="${areaPts}"/>
    <polyline fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" points="${pts}"/>
    <circle cx="${(data.length-1)*sx}" cy="${lastY}" r="2.5" fill="${color}"/>
  </svg>`;
}

// ── Interactive Chart (canvas-based with hover tooltip) ──
function mountInteractiveChart(canvasId, data, color, marketTrades, outcomeLabel){
  const canvas=document.getElementById(canvasId);
  if(!canvas||!data||data.length<2)return;
  const ctx=canvas.getContext('2d');
  const dpr=window.devicePixelRatio||1;
  const rect=canvas.parentElement.getBoundingClientRect();
  const W=rect.width, H=120;
  canvas.width=W*dpr; canvas.height=H*dpr;
  canvas.style.width=W+'px'; canvas.style.height=H+'px';
  ctx.scale(dpr,dpr);

  const pad={t:20,r:12,b:24,l:40};
  const cw=W-pad.l-pad.r, ch=H-pad.t-pad.b;
  const mn=Math.min(...data)-.05, mx=Math.max(...data)+.05, rn=mx-mn||1;

  // Find related trades for timestamp mapping
  const relTrades=marketTrades||[];
  
  function xFor(i){return pad.l+(i/(data.length-1))*cw}
  function yFor(v){return pad.t+ch-(((v-mn)/rn)*ch)}

  function draw(hoverIdx){
    ctx.clearRect(0,0,W,H);

    // Grid lines
    ctx.strokeStyle='#E8ECF1';ctx.lineWidth=0.5;
    const gridSteps=[.25,.5,.75];
    gridSteps.forEach(frac=>{
      const gv=mn+rn*frac, gy=yFor(gv);
      ctx.beginPath();ctx.moveTo(pad.l,gy);ctx.lineTo(W-pad.r,gy);ctx.stroke();
      ctx.fillStyle='#9CA3B4';ctx.font='10px IBM Plex Mono,monospace';ctx.textAlign='right';
      ctx.fillText(Math.round(gv*100)+'%',pad.l-6,gy+3);
    });

    // Area fill
    ctx.beginPath();
    ctx.moveTo(xFor(0),H-pad.b);
    data.forEach((v,i)=>ctx.lineTo(xFor(i),yFor(v)));
    ctx.lineTo(xFor(data.length-1),H-pad.b);
    ctx.closePath();
    const grad=ctx.createLinearGradient(0,pad.t,0,H-pad.b);
    grad.addColorStop(0,color+'25');grad.addColorStop(1,color+'05');
    ctx.fillStyle=grad;ctx.fill();

    // Line
    ctx.beginPath();
    ctx.strokeStyle=color;ctx.lineWidth=2;ctx.lineJoin='round';ctx.lineCap='round';
    data.forEach((v,i)=>{if(i===0)ctx.moveTo(xFor(i),yFor(v));else ctx.lineTo(xFor(i),yFor(v))});
    ctx.stroke();

    // End dot
    const lastX=xFor(data.length-1),lastYp=yFor(data[data.length-1]);
    ctx.beginPath();ctx.arc(lastX,lastYp,3.5,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
    ctx.beginPath();ctx.arc(lastX,lastYp,2,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();

    // Current price label
    ctx.fillStyle=color;ctx.font='bold 11px IBM Plex Mono,monospace';ctx.textAlign='left';
    ctx.fillText(Math.round(data[data.length-1]*100)+'%',lastX+8,lastYp+4);

    // Hover crosshair & tooltip
    if(hoverIdx!=null&&hoverIdx>=0&&hoverIdx<data.length){
      const hx=xFor(hoverIdx),hy=yFor(data[hoverIdx]);
      // Vertical line
      ctx.strokeStyle='#94A3B8';ctx.lineWidth=1;ctx.setLineDash([3,3]);
      ctx.beginPath();ctx.moveTo(hx,pad.t);ctx.lineTo(hx,H-pad.b);ctx.stroke();
      ctx.setLineDash([]);
      // Horizontal line
      ctx.strokeStyle='#94A3B8';ctx.lineWidth=0.5;ctx.setLineDash([3,3]);
      ctx.beginPath();ctx.moveTo(pad.l,hy);ctx.lineTo(W-pad.r,hy);ctx.stroke();
      ctx.setLineDash([]);
      // Dot
      ctx.beginPath();ctx.arc(hx,hy,5,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
      ctx.beginPath();ctx.arc(hx,hy,2.5,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();
      // Tooltip box
      const pct=Math.round(data[hoverIdx]*100);
      const tradeNum=hoverIdx+1;
      const label=pct+'% · Trade #'+tradeNum;
      ctx.font='bold 11px DM Sans,system-ui,sans-serif';
      const tw=ctx.measureText(label).width+16;
      let tx=hx-tw/2,ty=hy-28;
      if(tx<pad.l)tx=pad.l;if(tx+tw>W-pad.r)tx=W-pad.r-tw;if(ty<4)ty=hy+12;
      // Draw rounded rect (compatible fallback)
      const tR=6,tH=22;
      ctx.fillStyle='#0F1729';ctx.beginPath();
      ctx.moveTo(tx+tR,ty);ctx.lineTo(tx+tw-tR,ty);ctx.quadraticCurveTo(tx+tw,ty,tx+tw,ty+tR);
      ctx.lineTo(tx+tw,ty+tH-tR);ctx.quadraticCurveTo(tx+tw,ty+tH,tx+tw-tR,ty+tH);
      ctx.lineTo(tx+tR,ty+tH);ctx.quadraticCurveTo(tx,ty+tH,tx,ty+tH-tR);
      ctx.lineTo(tx,ty+tR);ctx.quadraticCurveTo(tx,ty,tx+tR,ty);ctx.fill();
      ctx.fillStyle='#fff';ctx.textAlign='center';
      ctx.fillText(label,tx+tw/2,ty+15);
    }
  }

  draw(null);

  // Mouse & touch events
  function getIdx(clientX){
    const br=canvas.getBoundingClientRect();
    const mx2=clientX-br.left;
    return Math.max(0,Math.min(data.length-1,Math.round(((mx2-pad.l)/cw)*(data.length-1))));
  }
  canvas.onmousemove=e=>{draw(getIdx(e.clientX));canvas.style.cursor='crosshair'};
  canvas.onmouseleave=()=>{draw(null);canvas.style.cursor='default'};
  canvas.ontouchmove=e=>{e.preventDefault();if(e.touches[0])draw(getIdx(e.touches[0].clientX))};
  canvas.ontouchend=()=>draw(null);
}

// ── LEADERBOARD ──
function getLeaderboard(){
  const map={};
  S.trades.forEach(t=>{
    const who=canonicalName(t.who);
    if(!map[who])map[who]={name:who,trades:0,volume:0,pnl:0};
    map[who].trades++;map[who].volume+=Math.abs(t.amount||0);
    const mk=S.markets.find(m=>m.id===t.mid);
    if(mk&&mk.outcomes[t.outcomeIdx]){
      if(mk.resolved){
        const won=(t.side==='yes'&&t.outcomeIdx===mk.winnerIdx)||(t.side==='no'&&t.outcomeIdx!==mk.winnerIdx);
        if(mk.cancelled){/* no pnl */}
        else if(won)map[who].pnl+=(t.shares-t.amount);
        else map[who].pnl+=(-t.amount);
      }else{
        const cur=t.side==='yes'?mk.outcomes[t.outcomeIdx].price:(1-mk.outcomes[t.outcomeIdx].price);
        map[who].pnl+=(cur-t.avg)*t.shares;
      }
    }
  });
  return Object.values(map).sort((a,b)=>b.pnl-a.pnl);
}

// ── Helper: time ago ──
function timeAgo(ts){
  const s=Math.floor((Date.now()-ts)/1000);
  if(s<60)return'just now';
  if(s<3600)return Math.floor(s/60)+'m ago';
  if(s<86400)return Math.floor(s/3600)+'h ago';
  return Math.floor(s/86400)+'d ago';
}

// ═══ RENDER ═══
function render(){
  const app=document.getElementById('app'),s=S;
  if(s.ready&&!s.name){
    app.innerHTML=`<div class="setup-screen"><div class="setup-box">
      <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:4px">
        <div style="width:30px;height:30px;border-radius:5px;background:${T};display:flex;align-items:center;justify-content:center;font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:11px;color:#fff">CM</div>
        <span style="font-weight:700;font-size:17px">CMD<span style="color:${T}">predict</span></span>
      </div>
      <div style="font-size:12.5px;color:var(--tx3);margin-bottom:28px">Internal Prediction Market</div>
      ${useFirebase?`<div style="font-size:12px;color:var(--gn);margin-bottom:16px"><span class="live-dot"></span>Connected — real-time sync active</div>`:`<div style="background:#FEF3C7;border:1px solid #FDE68A;border-radius:8px;padding:12px;margin-bottom:20px;font-size:12px;color:#92400E;line-height:1.5;text-align:left">⚠️ <strong>Local mode.</strong></div>`}
      <div style="width:56px;height:56px;border-radius:50%;background:var(--tl);display:flex;align-items:center;justify-content:center;margin:0 auto 18px;font-size:24px">👤</div>
      <h2 style="font-size:17px;font-weight:700;margin-bottom:5px">Welcome</h2>
      <p style="font-size:13px;color:var(--tx2);margin-bottom:22px;line-height:1.5">Enter your name to continue.</p>
      <input id="name-input" placeholder="Your first name" value="${s.nameIn}" style="margin-bottom:12px;text-align:center;font-size:14.5px">
      <button class="btn btn-t" id="name-btn" style="width:100%;padding:11px;font-size:14px">Enter CMDpredict</button>
      <button class="btn btn-ghost" id="guest-btn" style="width:100%;margin-top:8px;padding:9px;font-size:13px">👁️ View as Guest</button>
    </div></div>`;
    const ni=document.getElementById('name-input');
    ni.addEventListener('input',e=>{S.nameIn=e.target.value});
    ni.addEventListener('keydown',e=>{if(e.key==='Enter')confirmName()});
    document.getElementById('name-btn').addEventListener('click',confirmName);
    document.getElementById('guest-btn').addEventListener('click',enterGuest);
    ni.focus();return;
  }
  if(!s.ready){app.innerHTML=`<div class="setup-screen"><div class="m" style="color:${T}">Loading...</div></div>`;return}

  const list=s.markets.filter(m=>s.cat==='All'||m.category===s.cat).filter(m=>m.title.toLowerCase().includes(s.q.toLowerCase()))
    .sort((a,b)=>{
      // Resolved/cancelled markets always go to the bottom
      if(a.resolved&&!b.resolved)return 1;
      if(!a.resolved&&b.resolved)return -1;
      return s.sort==='newest'?b.id-a.id:(b.volume||0)-(a.volume||0);
    });
  const tv=s.markets.reduce((x,m)=>x+(m.volume||0),0),tt=s.trades.length,lb=getLeaderboard(),admin=isAdmin();
  const league=getLeagueTable(),loser=league.length>0?league[league.length-1]:null;
  const tabs=['league','markets',s.isGuest?null:'portfolio','leaderboard','activity'].filter(Boolean);
  if(admin)tabs.push('admin');

  app.innerHTML=`
  ${s.notif?`<div class="notif" style="color:${s.notif.type==='err'?RD:GN};border-color:${s.notif.type==='err'?RD:GN}">${s.notif.msg}</div>`:''}
  <header><div class="hdr-inner">
    <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
      <div style="display:flex;align-items:center;gap:6px;cursor:pointer" id="logo-click">
        <div style="width:24px;height:24px;border-radius:4px;background:${T};display:flex;align-items:center;justify-content:center;font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:9.5px;color:#fff">CM</div>
        <span style="font-weight:700;font-size:14.5px">CMD<span style="color:${T}">predict</span></span>
      </div>
      <div style="width:1px;height:20px;background:var(--bdr)"></div>
      <div style="display:flex;gap:1px">
        ${tabs.map(v=>`<button class="tab ${s.view===v?'active':''}" data-view="${v}">${v==='admin'?'⚙️ Admin':v==='activity'?'📋 Activity':v==='league'?'🏆 League':v[0].toUpperCase()+v.slice(1)}</button>`).join('')}
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:10px">
      ${useFirebase?'<span class="live-dot"></span>':''}
      ${s.isGuest?'':`<span class="m" style="font-size:12.5px;color:${GN};font-weight:600">$${s.portfolio.balance.toLocaleString()}</span>`}
      ${s.isGuest?'':`<button class="btn btn-t" id="new-market-btn" style="padding:5px 12px;font-size:12px">+ New Market</button>`}
      <div style="display:flex;align-items:center;gap:5px;padding:3px 8px 3px 3px;border-radius:18px;background:${s.isGuest?'#F1F5F9':'var(--tl)'}">
        <div style="width:24px;height:24px;border-radius:50%;background:${s.isGuest?'#94A3B8':T};display:flex;align-items:center;justify-content:center;font-size:9.5px;font-weight:700;color:#fff">${s.isGuest?'👁️':s.name.slice(0,2).toUpperCase()}</div>
        <span style="font-size:12px;font-weight:600;color:${s.isGuest?'#94A3B8':TD}">${s.isGuest?'Guest':s.name}</span>
        ${admin?'<span style="font-size:8px;background:#FEF3C7;color:#92400E;padding:1px 5px;border-radius:3px;font-weight:700">ADMIN</span>':''}
      </div>
    </div>
  </div></header>
  <main>

  ${s.view==='league'?renderLeague(league,loser):''}
  ${s.view==='markets'?renderMarkets(list,tv,tt,lb):''}
  ${s.view==='portfolio'?renderPortfolio():''}
  ${s.view==='leaderboard'?renderLeaderboard(lb):''}
  ${s.view==='activity'?renderActivityFeed():''}
  ${s.view==='admin'&&admin?renderAdmin():''}

  </main>
  <footer>
    <div style="width:16px;height:16px;border-radius:3px;background:${T};display:flex;align-items:center;justify-content:center;font-family:'IBM Plex Mono',monospace;font-weight:700;font-size:6.5px;color:#fff">CM</div>
    <span>CMD<span style="color:${T}">predict</span></span><span>·</span><span>Lowest balance buys the first round 🍺</span>
    ${useFirebase?'<span>·</span><span><span class="live-dot"></span>Real-time sync</span>':''}
  </footer>`;

  if(s.sel)mountDetail();
  if(s.creating)mountCreate();
  if(s.editing)mountEdit();
  if(s.resolving)mountResolve();
  if(s.viewingUser)mountUserProfile();
  if(s.addingUser&&admin)mountAddUser();
  if(s.endingSeasonModal&&admin)mountEndSeason();
  bindEvents();
}

// ── VIEW RENDERERS ──

function renderLeague(league,loser){
  const s=S,admin=isAdmin(),past=S.seasons.filter(x=>x.ended).slice(0,10);
  const medals=['🥇','🥈','🥉'];
  return`
    <div class="season-banner">
      <div style="position:relative;z-index:1">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
          <div>
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,.5);font-weight:600;margin-bottom:4px">${s.currentSeason?'CURRENT SEASON':'NO ACTIVE SEASON'}</div>
            <div style="font-size:22px;font-weight:700">${s.currentSeason?s.currentSeason.label:'Start a new season to begin'}</div>
            ${s.currentSeason?`<div style="font-size:12px;color:rgba(255,255,255,.6);margin-top:4px">Started ${fmtDate(s.currentSeason.startedAt)} · Everyone started with $${START_BAL.toLocaleString()}</div>`:''}
          </div>
          ${admin?`<div style="display:flex;gap:8px">
            ${s.currentSeason?`<button class="btn btn-beer" id="end-season-btn">🍺 End Season — Call Drinks</button>`:''}
            <button class="btn" id="start-season-btn" style="background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.2);font-size:12px;padding:7px 14px">${s.currentSeason?'🔄 Reset & New':'🏁 Start Season'}</button>
          </div>`:''}
        </div>
        ${loser&&s.currentSeason?`<div style="margin-top:14px;padding:10px 14px;background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.25);border-radius:8px;display:flex;align-items:center;gap:10px">
          <span class="beer-icon">🍺</span>
          <div><span style="font-weight:700;color:#FCA5A5">${loser.name}</span> <span style="color:rgba(255,255,255,.7)">is currently on the hook for beers</span> <span class="m" style="color:#FCA5A5;font-weight:600">($${loser.portfolioValue.toLocaleString()})</span></div>
        </div>`:''}
      </div>
    </div>

    <div class="league-card" style="margin-bottom:24px">
      <div style="padding:14px 18px;border-bottom:1px solid var(--bdr);display:flex;justify-content:space-between;align-items:center">
        <div style="font-weight:700;font-size:15px">League Table</div>
        <div style="font-size:11px;color:var(--tx3)">Ranked by portfolio value · Click to view profile</div>
      </div>
      ${league.map((p,i)=>{
        const isL=i===league.length-1&&league.length>1,isMe=p.name.toLowerCase()===s.name.toLowerCase();
        return`<div class="league-row ${isL?'is-loser':''} view-user-btn" data-user="${p.name}">
          <div class="league-rank" style="color:${i===0?'#F59E0B':i===1?'#94A3B8':i===2?'#CD7F32':'#CBD5E1'}">${medals[i]||(i+1)}</div>
          <div style="display:flex;align-items:center;gap:10px;min-width:0">
            <div style="width:36px;height:36px;border-radius:50%;background:${isL?RD:T};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0">${p.name.slice(0,2).toUpperCase()}</div>
            <div style="min-width:0">
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                <span style="font-weight:700;font-size:14.5px">${p.name}</span>
                ${isMe?`<span class="pill" style="background:${TL};color:${T}">YOU</span>`:''}
                ${isL?'<span class="beer-badge">🍺 BEERS</span>':''}
              </div>
              <div style="font-size:11.5px;color:var(--tx3);margin-top:1px">${p.trades} trades · ${p.wins}W/${p.losses}L</div>
            </div>
          </div>
          <div style="text-align:right">
            <div class="m" style="font-size:14px;font-weight:700;color:${p.pnl>=0?GN:RD}">${p.pnl>=0?'+':''}${fmtMoney(p.pnl)}</div>
            <div style="font-size:10px;color:var(--tx3)">P&L</div>
          </div>
          <div style="text-align:right">
            <div class="m" style="font-size:14px;font-weight:700">${fmtMoney(p.portfolioValue)}</div>
            <div style="font-size:10px;color:var(--tx3)">${p.openValue>0?fmtMoney(p.cashBalance)+' + '+fmtMoney(p.openValue)+' open':'Portfolio'}</div>
          </div>
        </div>`}).join('')}
    </div>

    ${past.length>0?`
      <div style="margin-bottom:24px">
        <h3 style="font-size:16px;font-weight:700;margin-bottom:14px;display:flex;align-items:center;gap:8px">🍺 Hall of Shame <span style="font-size:11px;color:var(--tx3);font-weight:400">— Past season losers</span></h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px">
          ${past.map(ps=>`
            <div class="shame-card">
              <div style="font-size:28px;margin-bottom:6px">🍺</div>
              <div style="font-weight:700;font-size:14px;color:${RD};margin-bottom:2px">${ps.loser||'Unknown'}</div>
              <div style="font-size:11px;color:var(--tx3);margin-bottom:6px">${ps.label}</div>
              <div style="font-size:10px;color:var(--tx3)">${fmtDate(ps.startedAt)} — ${fmtDate(ps.endedAt)}</div>
              ${ps.loserBalance!=null?`<div class="m" style="font-size:12px;color:${RD};font-weight:600;margin-top:4px">$${ps.loserBalance.toLocaleString()}</div>`:''}
              ${ps.standings?`<div style="margin-top:8px;font-size:10.5px;color:var(--tx2);text-align:left;border-top:1px solid rgba(0,0,0,.06);padding-top:6px">
                ${ps.standings.map((st,si)=>`<div style="display:flex;justify-content:space-between;padding:1px 0;${si===ps.standings.length-1?'color:'+RD+';font-weight:600':''}"><span>${si+1}. ${st.name}</span><span class="m">$${(st.portfolioValue||0).toLocaleString()}</span></div>`).join('')}
              </div>`:''}
            </div>`).join('')}
        </div>
      </div>`:''}`;
}

function mountEndSeason(){
  const league=getLeagueTable(),loser=league.length>0?league[league.length-1]:null;
  let html=`<div class="overlay" id="endseason-overlay"><div class="modal" style="text-align:center;max-width:460px">
    <div style="font-size:64px;margin-bottom:12px">🍺</div>
    <h2 style="font-size:20px;font-weight:700;margin-bottom:6px">End ${S.currentSeason?.label||'Season'}?</h2>
    <p style="font-size:13px;color:var(--tx2);margin-bottom:20px;line-height:1.5">This will lock in the final standings and declare the loser who buys the first round.</p>
    ${loser?`<div style="background:linear-gradient(135deg,#FEF2F2,#FFF7ED);border:1px solid #FECACA;border-radius:10px;padding:16px;margin-bottom:20px">
      <div style="font-size:12px;color:var(--tx3);margin-bottom:4px">BUYING THE FIRST ROUND</div>
      <div style="font-size:24px;font-weight:700;color:${RD}">${loser.name}</div>
      <div class="m" style="font-size:14px;color:${RD};margin-top:2px">$${loser.portfolioValue.toLocaleString()} final balance</div>
    </div>`:''}
    <div style="display:flex;flex-direction:column;gap:6px;text-align:left;margin-bottom:20px;background:#F8FAFC;border-radius:8px;padding:12px">
      <div style="font-size:10px;font-weight:600;color:var(--tx3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Final Standings</div>
      ${league.map((p,i)=>`<div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;padding:2px 0;${i===league.length-1?'color:'+RD+';font-weight:700':''}"><span>${i+1}. ${p.name} ${i===league.length-1?'🍺':''}</span><span class="m" style="font-weight:600">$${p.portfolioValue.toLocaleString()}</span></div>`).join('')}
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn btn-ghost" id="cancel-end-season" style="flex:1">Cancel</button>
      <button class="btn btn-beer" id="confirm-end-season" style="flex:1">🍺 End Season & Declare Loser</button>
    </div>
  </div></div>`;
  document.getElementById('app').insertAdjacentHTML('beforeend',html);
  document.getElementById('cancel-end-season').onclick=()=>{S.endingSeasonModal=false;render()};
  document.getElementById('endseason-overlay').onclick=e=>{if(e.target===e.currentTarget){S.endingSeasonModal=false;render()}};
  document.getElementById('confirm-end-season').onclick=endCurrentSeason;
}

function renderMarkets(list,tv,tt,lb){
  const s=S;
  return`
    <div style="background:linear-gradient(135deg,#1B8A9E 0%,#156F80 100%);border-radius:12px;padding:20px;margin-bottom:24px;display:grid;grid-template-columns:repeat(4,1fr);gap:16px">
      ${[{l:'Active Markets',v:s.markets.filter(m=>!m.resolved).length},{l:'Total Volume',v:tv?fmtMoney(tv):'$0'},{l:'Total Trades',v:tt},{l:'Analysts',v:lb.length}].map((x,i)=>`
        <div style="animation:fadeUp .35s ease ${i*.06}s both"><div style="font-size:11px;color:rgba(255,255,255,.6);font-weight:500;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">${x.l}</div><div class="m" style="font-size:22px;font-weight:700;color:#fff">${x.v}</div></div>`).join('')}
    </div>
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <input id="search-input" placeholder="Search markets..." value="${s.q}" style="flex:1">
      <select id="sort-select" style="width:auto;min-width:115px"><option value="newest" ${s.sort==='newest'?'selected':''}>Newest</option><option value="volume" ${s.sort==='volume'?'selected':''}>Volume</option></select>
    </div>
    <div style="display:flex;gap:4px;margin-bottom:18px;flex-wrap:wrap">
      ${CATS.map(c=>`<button class="cat-btn" data-cat="${c}" style="padding:4px 12px;border-radius:20px;font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;border:1px solid ${s.cat===c?T:'var(--bdr)'};background:${s.cat===c?TL:'transparent'};color:${s.cat===c?T:'var(--tx2)'};transition:all .1s">${c!=='All'?CI[c]+' ':''}${c}</button>`).join('')}
    </div>
    ${list.length===0?`<div style="text-align:center;padding:60px 20px;background:#fff;border:1px solid var(--bdr);border-radius:12px"><div style="font-size:40px;margin-bottom:12px">🏛️</div><div style="font-size:16px;font-weight:600;margin-bottom:6px">${s.markets.length===0?'No markets yet':'No matches'}</div><div style="font-size:13.5px;color:var(--tx2);max-width:360px;margin:0 auto 20px">${s.markets.length===0?'Create the first prediction market.':'Try a different filter.'}</div>${s.markets.length===0?'<button class="btn btn-t" id="first-market-btn">Create First Market</button>':''}</div>`
    :`<div class="market-grid">${list.map((m,i)=>{
      const topOc=m.outcomes.slice(0,3);
      return`<div class="card" data-market-id="${m.id}" style="animation-delay:${i*.04}s;${m.resolved?'opacity:.6':''}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
          <div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">
            <span class="pill" style="background:${TL};color:${T}">${CI[m.category]||'🔮'} ${m.category}</span>
            ${m.resolved?`<span class="${m.cancelled?'cancelled-badge':'resolved-badge'}">${m.cancelled?'Cancelled':'Resolved'}</span>`:''}
          </div>
          <div style="font-size:11px;color:var(--tx3)">${new Date(m.endDate).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</div>
        </div>
        <div style="font-size:15px;font-weight:700;line-height:1.35;margin-bottom:14px;letter-spacing:-.01em">${m.title}</div>
        ${m.outcomes.length===2&&topOc[0]?.history?.length>1?`<div class="spark-area">${spark(topOc[0].history,320,34,T)}</div>`:''}
        <div style="display:flex;flex-direction:column;gap:2px;margin-bottom:12px">
          ${topOc.map((o,j)=>{const pct=Math.round(o.price*100),w=m.resolved&&m.winnerIdx===j;
            const tier=w?'winner':pct>=65?'high':pct<=35?'low':'mid';
            return`<div class="mkt-outcome">
              <span class="mkt-outcome-label ${w?'winner':''}">${w?'✓ ':''}${o.label}</span>
              <span class="mkt-odds ${tier}">${w?'WON':pct+'%'}</span>
            </div>`}).join('')}
          ${m.outcomes.length>3?`<div style="font-size:11px;color:var(--tx3);padding:2px 0">+${m.outcomes.length-3} more</div>`:''}
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--tx3);padding-top:10px;border-top:1px solid #F1F5F9">
          <span>${m.creator}</span>
          <div style="display:flex;gap:10px">${m.volume?`<span>${fmtMoney(m.volume)} vol</span>`:''}<span>${m.traders||0} trades</span></div>
        </div>
      </div>`}).join('')}</div>`}`;
}

function renderPortfolio(){
  const s=S;
  // Separate open vs resolved positions
  const openPos=[], closedPos=[];
  s.portfolio.positions.forEach((p,pi)=>{
    const mk=s.markets.find(m=>m.id===p.mid);
    const resolved=mk&&mk.resolved;
    (resolved?closedPos:openPos).push({...p,_idx:pi,_mk:mk,_resolved:resolved});
  });

  function posRow(p){
    const mk=p._mk;let cur=p.avg;
    const canSell=mk&&!mk.resolved;
    if(mk&&mk.outcomes[p.outcomeIdx]){const op=mk.outcomes[p.outcomeIdx].price;cur=p.side==='yes'?op:(1-op)}
    const pnl=(cur-p.avg)*p.shares;
    return`<div style="background:var(--card);border:1px solid var(--bdr);border-radius:10px;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;${p._resolved?'opacity:.6':''}">
      <div style="min-width:0;flex:1"><div style="font-size:13px;font-weight:600;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.title}</div>
        <div style="display:flex;gap:8px;font-size:11px;color:var(--tx3);align-items:center;flex-wrap:wrap"><span class="pill" style="background:${p.side==='yes'?'rgba(22,163,74,.08)':'rgba(220,38,38,.08)'};color:${p.side==='yes'?GN:RD}">${p.side.toUpperCase()}</span><span style="color:${T};font-weight:600">${p.outcomeLabel}</span><span class="m">${Math.round(p.shares)} @ ${Math.round(p.avg*100)}¢</span></div>
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        <div style="text-align:right;flex-shrink:0"><div class="m" style="font-size:14px;font-weight:700;color:${pnl>=0?GN:RD}">${pnl>=0?'+':''}$${Math.abs(pnl).toFixed(0)}</div><div style="font-size:10px;color:var(--tx3)">now ${Math.round(cur*100)}¢</div></div>
        ${canSell?`<button class="btn btn-ghost sell-pos-btn" data-pos-idx="${p._idx}" style="padding:5px 10px;font-size:11px;color:${RD};border-color:rgba(220,38,38,.25)">Sell</button>`:''}
      </div>
    </div>`}

  // Calculate real P&L from positions
  let totalOpenVal=0, totalCost=0;
  s.portfolio.positions.forEach(p=>{
    const mk=s.markets.find(m=>m.id===p.mid);
    totalCost+=(p.amount||0);
    if(mk&&mk.outcomes[p.outcomeIdx]){
      const cur=p.side==='yes'?mk.outcomes[p.outcomeIdx].price:(1-mk.outcomes[p.outcomeIdx].price);
      totalOpenVal+=cur*p.shares;
    }
  });
  const netPnl=totalOpenVal+s.portfolio.balance-START_BAL;

  return`<h2 style="font-size:18px;font-weight:700;margin-bottom:18px">Your Portfolio</h2>
    <div style="background:linear-gradient(135deg,#1B8A9E,#156F80);border-radius:12px;padding:20px;margin-bottom:20px;display:grid;grid-template-columns:repeat(4,1fr);gap:16px">
      ${[{l:'Cash',v:'$'+s.portfolio.balance.toLocaleString()},{l:'Open Value',v:fmtMoney(totalOpenVal)},{l:'Net P&L',v:(netPnl>=0?'+':'')+fmtMoney(netPnl)},{l:'Positions',v:openPos.length+' open'}].map(x=>`<div><div style="font-size:11px;color:rgba(255,255,255,.6);font-weight:500;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">${x.l}</div><div class="m" style="font-size:20px;font-weight:700;color:#fff">${x.v}</div></div>`).join('')}
    </div>
    ${openPos.length>0?`<div style="margin-bottom:24px">
      <div style="font-size:12px;font-weight:600;color:var(--tx3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px">Open Positions</div>
      <div style="display:flex;flex-direction:column;gap:8px">${openPos.map(p=>posRow(p)).join('')}</div>
    </div>`:''}
    ${closedPos.length>0?`<div>
      <div style="font-size:12px;font-weight:600;color:var(--tx3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px">Resolved</div>
      <div style="display:flex;flex-direction:column;gap:8px">${closedPos.map(p=>posRow(p)).join('')}</div>
    </div>`:''}
    ${s.portfolio.positions.length===0?`<div style="text-align:center;padding:40px;color:var(--tx3);background:var(--card);border:1px solid var(--bdr);border-radius:10px"><div style="font-size:32px;margin-bottom:8px">📈</div><div style="font-size:14px">No positions yet</div></div>`:''}`;
}

function renderLeaderboard(lb){
  return`<h2 style="font-size:18px;font-weight:700;margin-bottom:6px">Analyst Leaderboard</h2>
    <p style="font-size:12.5px;color:var(--tx2);margin-bottom:18px">Click any analyst to view their full trade history and P&L breakdown.</p>
    ${lb.length===0?`<div style="text-align:center;padding:40px;color:var(--tx3);background:#fff;border:1px solid var(--bdr);border-radius:10px"><div style="font-size:32px;margin-bottom:8px">🏆</div><div style="font-size:14px">No trades yet</div></div>`:`
      <div style="background:#fff;border:1px solid var(--bdr);border-radius:10px;overflow:hidden">
        <div style="display:grid;grid-template-columns:40px 1fr 90px 80px 70px;padding:10px 14px;border-bottom:1px solid var(--bdr);font-size:9.5px;color:var(--tx3);text-transform:uppercase;letter-spacing:.5px;font-weight:600"><span>#</span><span>Analyst</span><span style="text-align:right">P&amp;L</span><span style="text-align:right">Volume</span><span style="text-align:right">Trades</span></div>
        ${lb.map((u,i)=>`<div class="view-user-btn" data-user="${u.name}" style="display:grid;grid-template-columns:40px 1fr 90px 80px 70px;padding:12px 14px;border-bottom:1px solid #F1F5F9;align-items:center;cursor:pointer;transition:background .1s;${u.name===S.name?'background:'+TL:''}" onmouseover="this.style.background='${TL}'" onmouseout="this.style.background='${u.name===S.name?TL:''}'">
          <span class="m" style="font-weight:700;font-size:13px;color:${i===0?'#F59E0B':i===1?'#94A3B8':i===2?'#CD7F32':'#CBD5E1'}">${i+1}</span>
          <div style="display:flex;align-items:center;gap:8px"><div style="width:26px;height:26px;border-radius:50%;background:${T};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff">${u.name.slice(0,2).toUpperCase()}</div><span style="font-weight:600;font-size:13px">${u.name}${u.name===S.name?' (you)':''}</span></div>
          <span class="m" style="text-align:right;font-weight:700;font-size:13px;color:${u.pnl>=0?GN:RD}">${u.pnl>=0?'+':''}$${Math.abs(u.pnl).toFixed(0)}</span>
          <span class="m" style="text-align:right;color:var(--tx2);font-size:12px">$${u.volume.toFixed(0)}</span>
          <span class="m" style="text-align:right;color:var(--tx2);font-size:12px">${u.trades}</span>
        </div>`).join('')}
      </div>`}`;
}

// ── ACTIVITY FEED (visible to all) ──
function renderActivityFeed(){
  const recentTrades=[...S.trades].sort((a,b)=>b.ts-a.ts).slice(0,50);
  const recentActivity=activityLog.slice(0,30);

  // Merge trades + activity into one timeline
  const timeline=[];
  recentTrades.forEach(t=>{
    timeline.push({ts:t.ts,type:'trade',data:t});
  });
  recentActivity.forEach(a=>{
    if(a.type!=='trade')timeline.push({ts:a.ts,type:a.type,data:a});
  });
  timeline.sort((a,b)=>b.ts-a.ts);
  const items=timeline.slice(0,60);

  const icons={trade:'💰',market_created:'🏛️',resolve:'🏁',cancel:'❌',join:'👋',admin_funds:'💸',admin_set_balance:'⚖️',admin_add_user:'➕',admin_delete_user:'🗑️',delete_market:'🗑️'};

  return`<h2 style="font-size:18px;font-weight:700;margin-bottom:6px">Activity Feed</h2>
    <p style="font-size:12.5px;color:var(--tx2);margin-bottom:18px">All trading activity and market events. Click any user to view their profile.</p>
    ${items.length===0?`<div style="text-align:center;padding:40px;color:var(--tx3);background:#fff;border:1px solid var(--bdr);border-radius:10px"><div style="font-size:32px;margin-bottom:8px">📋</div><div style="font-size:14px">No activity yet — start trading!</div></div>`:`
      <div style="background:#fff;border:1px solid var(--bdr);border-radius:10px;overflow:hidden">
        ${items.map(item=>{
          if(item.type==='trade'){
            const t=item.data;
            return`<div class="activity-row">
              <div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1">
                <span style="font-size:16px;flex-shrink:0">💰</span>
                <div style="min-width:0">
                  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                    <span class="view-user-btn" data-user="${t.who}" style="font-weight:600;color:${T};cursor:pointer">${t.who}</span>
                    <span>bought</span>
                    <span class="pill" style="background:${t.side==='yes'?'rgba(16,185,129,.07)':'rgba(239,68,68,.07)'};color:${t.side==='yes'?GN:RD}">${t.side.toUpperCase()}</span>
                    <span style="font-weight:500">"${t.outcomeLabel}"</span>
                  </div>
                  <div style="font-size:11px;color:var(--tx3);margin-top:2px">${t.title} · ${t.shares} shares @ ${Math.round(t.avg*100)}¢ · $${(t.amount||0).toFixed(0)}</div>
                </div>
              </div>
              <span style="font-size:11px;color:var(--tx3);flex-shrink:0;margin-left:8px">${timeAgo(item.ts)}</span>
            </div>`;
          }else{
            const a=item.data;
            return`<div class="activity-row">
              <div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1">
                <span style="font-size:16px;flex-shrink:0">${icons[a.type]||'📌'}</span>
                <div style="min-width:0">
                  <div style="font-size:12.5px">${a.desc||a.type}</div>
                </div>
              </div>
              <span style="font-size:11px;color:var(--tx3);flex-shrink:0;margin-left:8px">${timeAgo(item.ts)}</span>
            </div>`;
          }
        }).join('')}
      </div>`}`;
}

// ── ADMIN PANEL ──
function renderAdmin(){
  const users=Object.values(S.users).sort((a,b)=>(b.balance||0)-(a.balance||0));
  return`<h2 style="font-size:18px;font-weight:700;margin-bottom:18px">⚙️ Admin Panel</h2>
    <div class="stats-grid" style="grid-template-columns:repeat(4,1fr)">
      <div class="stat-card"><div class="stat-label">Registered Users</div><div class="m" style="font-size:20px;font-weight:700;color:${T}">${users.length}</div></div>
      <div class="stat-card"><div class="stat-label">Total Markets</div><div class="m" style="font-size:20px;font-weight:700;color:${GN}">${S.markets.length}</div></div>
      <div class="stat-card"><div class="stat-label">Total Trades</div><div class="m" style="font-size:20px;font-weight:700;color:#F59E0B">${S.trades.length}</div></div>
      <div class="stat-card"><div class="stat-label">Activity Log</div><div class="m" style="font-size:20px;font-weight:700;color:#6366F1">${activityLog.length}</div></div>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3 style="font-size:15px;font-weight:700">All Users</h3>
      <button class="btn btn-t" id="admin-add-user-btn" style="padding:5px 12px;font-size:12px">+ Add User</button>
    </div>

    ${users.length===0?`<div style="padding:30px;text-align:center;color:var(--tx3);background:#fff;border:1px solid var(--bdr);border-radius:10px">No users registered yet. Users appear here once they log in or you add them manually.</div>`:`
      <div style="background:#fff;border:1px solid var(--bdr);border-radius:10px;overflow:hidden">
        <div class="user-row-admin" style="padding:10px 14px;border-bottom:1px solid var(--bdr);font-size:9.5px;color:var(--tx3);text-transform:uppercase;letter-spacing:.5px;font-weight:600;display:grid;cursor:default">
          <span>User</span><span style="text-align:right">Balance</span><span style="text-align:right">Last Active</span><span style="text-align:right">Actions</span>
        </div>
        ${users.map(u=>{
          const stats=getUserStats(u.name);
          return`
          <div class="user-row-admin" style="display:grid;cursor:default">
            <div style="display:flex;align-items:center;gap:8px;cursor:pointer" class="view-user-btn" data-user="${u.name}">
              <div style="width:26px;height:26px;border-radius:50%;background:${T};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff">${(u.name||'?').slice(0,2).toUpperCase()}</div>
              <div>
                <span style="font-weight:600;font-size:13px;color:${T}">${u.name||'Unknown'}</span>
                <div style="font-size:10px;color:var(--tx3)">${stats.totalTrades} trades · P&L: <span style="color:${stats.totalPnl>=0?GN:RD}">${stats.totalPnl>=0?'+':''}$${Math.abs(stats.totalPnl).toFixed(0)}</span></div>
              </div>
            </div>
            <div style="text-align:right;display:flex;align-items:center;justify-content:flex-end">
              ${S.editingBalance===u.name
                ?`<input type="number" class="editable-balance admin-balance-input" data-user="${u.name}" value="${u.balance||0}" style="border-color:${T};background:#fff;box-shadow:0 0 0 3px rgba(27,138,158,.08)">`
                :`<span class="editable-balance admin-balance-edit" data-user="${u.name}" title="Click to edit" style="color:${(u.balance||0)>=0?GN:RD}">$${(u.balance||0).toLocaleString()}</span>`}
            </div>
            <span style="text-align:right;font-size:11px;color:var(--tx3)">${u.lastSeen?timeAgo(u.lastSeen):'-'}</span>
            <div style="text-align:right;display:flex;gap:4px;justify-content:flex-end">
              <button class="btn btn-ghost add-funds-btn" data-user="${u.name}" style="padding:4px 8px;font-size:11px">+ Funds</button>
              <button class="btn btn-danger admin-delete-btn" data-user="${u.name}" style="padding:4px 8px;font-size:11px">Delete</button>
            </div>
          </div>`;
        }).join('')}
      </div>
    `}

    ${S.addFundsUser?`
      <div style="margin-top:16px;background:#fff;border:1px solid var(--bdr);border-radius:10px;padding:18px">
        <h4 style="font-size:14px;font-weight:600;margin-bottom:10px">Add funds to: <span style="color:${T}">${S.addFundsUser}</span></h4>
        <div style="display:flex;gap:8px">
          <input type="number" id="add-funds-amount" placeholder="Amount ($)" value="${S.addFundsAmt}" style="flex:1">
          <button class="btn btn-t" id="add-funds-btn">Add Funds</button>
          <button class="btn btn-ghost" id="cancel-funds-btn">Cancel</button>
        </div>
      </div>
    `:''}

    <h3 style="font-size:15px;font-weight:700;margin-top:24px;margin-bottom:12px">Recent Activity Log</h3>
    <div style="background:#fff;border:1px solid var(--bdr);border-radius:10px;overflow:hidden;max-height:400px;overflow-y:auto">
      ${activityLog.length===0?`<div style="padding:20px;text-align:center;color:var(--tx3);font-size:13px">No activity logged yet. Actions will appear here as users trade, create markets, etc.</div>`:`
        ${activityLog.slice(0,40).map(a=>`<div class="activity-row">
          <div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1">
            <span style="font-size:14px">${{trade:'💰',market_created:'🏛️',resolve:'🏁',cancel:'❌',join:'👋',admin_funds:'💸',admin_set_balance:'⚖️',admin_add_user:'➕',admin_delete_user:'🗑️',delete_market:'🗑️'}[a.type]||'📌'}</span>
            <span style="font-size:12px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.desc||a.type}</span>
          </div>
          <span style="font-size:10.5px;color:var(--tx3);flex-shrink:0">${timeAgo(a.ts)}</span>
        </div>`).join('')}
      `}
    </div>`;
}

// ── USER PROFILE MODAL (visible to everyone) ──
function mountUserProfile(){
  const userName=S.viewingUser;
  const stats=getUserStats(userName);
  const userInfo=Object.values(S.users).find(u=>u.name===userName);
  const balance=userInfo?userInfo.balance:null;

  let html=`<div class="overlay" id="userprofile-overlay"><div class="modal modal-lg">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:42px;height:42px;border-radius:50%;background:${T};display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:#fff">${userName.slice(0,2).toUpperCase()}</div>
        <div>
          <h2 style="font-size:17px;font-weight:700">${userName}${userName===S.name?' (you)':''}</h2>
          ${balance!==null?`<div class="m" style="font-size:13px;color:${GN};font-weight:600">Balance: $${balance.toLocaleString()}</div>`:''}
        </div>
      </div>
      <button class="xbtn" id="close-userprofile">×</button>
    </div>

    <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:18px">
      <div class="stat-card"><div class="stat-label">Total P&L</div><div class="m" style="font-size:18px;font-weight:700;color:${stats.totalPnl>=0?GN:RD}">${stats.totalPnl>=0?'+':''}$${Math.abs(stats.totalPnl).toFixed(0)}</div></div>
      <div class="stat-card"><div class="stat-label">Total Volume</div><div class="m" style="font-size:18px;font-weight:700;color:${T}">$${stats.totalVolume.toFixed(0)}</div></div>
      <div class="stat-card"><div class="stat-label">Win / Loss</div><div class="m" style="font-size:18px;font-weight:700"><span style="color:${GN}">${stats.wins}</span> <span style="color:var(--tx3)">/</span> <span style="color:${RD}">${stats.losses}</span></div></div>
      <div class="stat-card"><div class="stat-label">Total Trades</div><div class="m" style="font-size:18px;font-weight:700;color:#6366F1">${stats.totalTrades}</div></div>
    </div>

    <h3 style="font-size:14px;font-weight:700;margin-bottom:10px">Trade History</h3>
    ${stats.trades.length===0?`<div style="padding:24px;text-align:center;color:var(--tx3);background:#F8FAFC;border-radius:8px;font-size:13px">No trades yet</div>`:`
      <div style="background:#fff;border:1px solid var(--bdr);border-radius:8px;overflow:hidden;max-height:400px;overflow-y:auto">
        <div style="display:grid;grid-template-columns:1fr 70px 80px 70px 60px;padding:8px 12px;border-bottom:1px solid var(--bdr);font-size:9px;color:var(--tx3);text-transform:uppercase;letter-spacing:.5px;font-weight:600">
          <span>Market</span><span style="text-align:center">Side</span><span style="text-align:right">Amount</span><span style="text-align:right">P&L</span><span style="text-align:right">Status</span>
        </div>
        ${stats.trades.map(t=>{
          const statusColors={won:GN,lost:RD,open:T,cancelled:'#92400E'};
          const statusBg={won:'#DCFCE7',lost:'#FEE2E2',open:TL,cancelled:'#FEF3C7'};
          return`<div style="display:grid;grid-template-columns:1fr 70px 80px 70px 60px;padding:10px 12px;border-bottom:1px solid #F1F5F9;align-items:center;font-size:12px">
            <div style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              <div style="font-weight:600;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.marketTitle}</div>
              <div style="font-size:10.5px;color:var(--tx3)">${t.outcomeLabel} · ${t.shares} shares @ ${Math.round(t.avg*100)}¢</div>
            </div>
            <div style="text-align:center"><span class="pill" style="background:${t.side==='yes'?'rgba(16,185,129,.07)':'rgba(239,68,68,.07)'};color:${t.side==='yes'?GN:RD}">${t.side.toUpperCase()}</span></div>
            <span class="m" style="text-align:right;font-size:11.5px">$${(t.amount||0).toFixed(0)}</span>
            <span class="m" style="text-align:right;font-weight:700;color:${t.pnl>=0?GN:RD};font-size:11.5px">${t.pnl>=0?'+':''}$${Math.abs(t.pnl).toFixed(0)}</span>
            <div style="text-align:right"><span style="font-size:9px;font-weight:700;padding:2px 6px;border-radius:3px;background:${statusBg[t.status]||'#F1F5F9'};color:${statusColors[t.status]||'var(--tx3)'};text-transform:uppercase;letter-spacing:.3px">${t.status}</span></div>
          </div>`;
        }).join('')}
      </div>`}
  </div></div>`;

  document.getElementById('app').insertAdjacentHTML('beforeend',html);
  document.getElementById('close-userprofile').onclick=()=>{S.viewingUser=null;render()};
  document.getElementById('userprofile-overlay').onclick=e=>{if(e.target===e.currentTarget){S.viewingUser=null;render()}};
}

// ── ADD USER MODAL (admin only) ──
function mountAddUser(){
  let html=`<div class="overlay" id="adduser-overlay"><div class="modal" style="max-width:420px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><h2 style="font-size:16.5px;font-weight:700">➕ Add New User</h2><button class="xbtn" id="close-adduser">×</button></div>
    <p style="font-size:12.5px;color:var(--tx2);margin-bottom:16px;line-height:1.5">Create a new user profile. They'll pick up this balance when they log in with this name.</p>
    <div style="display:flex;flex-direction:column;gap:12px">
      <div><label style="font-size:11px;color:var(--tx2);margin-bottom:4px;display:block;font-weight:600">Name *</label><input id="new-user-name" placeholder="e.g. Jane D." value="${S.newUserName}"></div>
      <div><label style="font-size:11px;color:var(--tx2);margin-bottom:4px;display:block;font-weight:600">Starting Balance</label><input type="number" id="new-user-balance" placeholder="10000" value="${S.newUserBalance}"></div>
      <button class="btn btn-t" id="confirm-add-user" style="width:100%;padding:11px;font-size:13.5px">Add User</button>
    </div>
  </div></div>`;
  document.getElementById('app').insertAdjacentHTML('beforeend',html);
  document.getElementById('close-adduser').onclick=()=>{S.addingUser=false;render()};
  document.getElementById('adduser-overlay').onclick=e=>{if(e.target===e.currentTarget){S.addingUser=false;render()}};
  document.getElementById('new-user-name').oninput=e=>{S.newUserName=e.target.value};
  document.getElementById('new-user-balance').oninput=e=>{S.newUserBalance=e.target.value};
  document.getElementById('confirm-add-user').onclick=adminAddUser;
}

// ── MODAL MOUNTS ──
function mountDetail(){
  const s=S,m=s.sel,admin=isAdmin(),canEdit=admin||m.creator===s.name;

  // Get recent trades on this market
  const marketTrades=[...S.trades].filter(t=>t.mid===m.id).sort((a,b)=>b.ts-a.ts).slice(0,10);

  let html=`<div class="overlay" id="detail-overlay"><div class="modal modal-lg">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
      <div><div style="display:flex;gap:5px;margin-bottom:5px;flex-wrap:wrap">
        <span class="pill" style="background:${TL};color:${T}">${CI[m.category]||'🔮'} ${m.category}</span>
        <span class="pill" style="background:#F0F4FF;color:#6366F1">${m.outcomes.length} contracts</span>
        ${m.resolved?`<span class="${m.cancelled?'cancelled-badge':'resolved-badge'}">${m.cancelled?'CANCELLED':'RESOLVED'}</span>`:''}</div>
        <h2 style="font-size:16.5px;font-weight:700;line-height:1.4">${m.title}</h2></div>
      <button class="xbtn" id="close-detail">×</button></div>
    <p style="font-size:13px;color:var(--tx2);line-height:1.5;margin-bottom:14px">${m.description}</p>
    ${canEdit&&!m.resolved?`<div style="display:flex;gap:6px;margin-bottom:14px"><button class="btn btn-ghost" id="edit-market-btn">✏️ Edit</button>${admin?`<button class="btn btn-ghost" id="resolve-market-btn" style="border-color:#F59E0B;color:#B45309">🏁 Resolve</button>`:''}</div>`:''}
    ${m.resolved&&m.resolvedBy?`<div style="font-size:12px;color:${m.cancelled?'#92400E':'#166534'};margin-bottom:12px;padding:8px 12px;background:${m.cancelled?'#FEF3C7':'#F0FDF4'};border-radius:6px;border:1px solid ${m.cancelled?'#FDE68A':'#BBF7D0'}">${m.cancelled?'Cancelled':'Resolved: <strong>'+m.outcomes[m.winnerIdx]?.label+'</strong> won'} — by ${m.resolvedBy}</div>`:''}
    <div style="font-size:11px;font-weight:600;color:var(--tx3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Contracts</div>
    <div style="display:flex;flex-direction:column;gap:5px;margin-bottom:16px">
      ${m.outcomes.map((o,j)=>{const pct=Math.round(o.price*100),active=s.selOc===j,w=m.resolved&&m.winnerIdx===j;
        const hasChart=o.history&&o.history.length>1;
        const isBinary=m.outcomes.length===2;
        const showByDefault=isBinary;
        return`<div>
          <div class="outcome-row" data-idx="${j}" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;cursor:pointer;border:2px solid ${active&&!m.resolved?T:'transparent'};background:${w?'#F0FDF4':active?'var(--tll)':'#F8FAFC'}">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600;color:${w?GN:'var(--tx)'}">
              ${w?'✓ ':''}${o.label}
              ${hasChart?`<button class="chart-toggle" data-oc="${j}" style="display:inline-flex;align-items:center;gap:4px;background:${showByDefault?'var(--tl)':'#F1F5F9'};border:1px solid ${showByDefault?T:'var(--bdr)'};border-radius:6px;padding:3px 8px;font-size:10.5px;color:${showByDefault?T:'var(--tx3)'};cursor:pointer;font-family:inherit;transition:all .12s;font-weight:500"><svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 9L4 5L7 7L11 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>Chart</button>`:''}
            </div>
            <div style="height:4px;border-radius:2px;background:#E2E8F0;overflow:hidden;margin-top:6px"><div style="height:100%;border-radius:2px;background:${w?GN:T};width:${pct}%"></div></div>
          </div>
          <div style="text-align:right;flex-shrink:0"><div class="m" style="font-size:18px;font-weight:700;color:${w?GN:T}">${pct}¢</div></div>
        </div>
        <div class="chart-panel" data-oc="${j}" style="display:${showByDefault&&hasChart?'block':'none'};padding:4px 0 8px;margin:0 4px">
          <div style="background:#FAFBFC;border:1px solid var(--bdr);border-radius:8px;padding:8px;position:relative">
            <canvas id="chart-${j}" style="width:100%;display:block"></canvas>
          </div>
        </div>
        </div>`}).join('')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:16px">
      ${[{l:'Volume',v:m.volume?'$'+(m.volume/1000).toFixed(1)+'K':'$0'},{l:'Liquidity',v:'$'+(m.liquidity/1000).toFixed(1)+'K'},{l:'Trades',v:m.traders||0},{l:'Ends',v:new Date(m.endDate).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}].map(x=>`<div style="text-align:center"><div style="font-size:9px;color:var(--tx3);text-transform:uppercase;letter-spacing:.4px;margin-bottom:2px">${x.l}</div><div class="m" style="font-size:12px;font-weight:600;color:#334155">${x.v}</div></div>`).join('')}
    </div>
    ${m.resolved||S.isGuest?'':`<div style="background:#F8FAFC;border-radius:8px;padding:16px;border:1px solid var(--bdr)">
      <div style="font-size:12px;font-weight:600;color:#334155;margin-bottom:10px">Trading: <span style="color:${T}">${m.outcomes[s.selOc]?.label||''}</span></div>
      <div style="display:flex;margin-bottom:10px;background:#EEF2F7;border-radius:5px;padding:2px">
        <button class="side-btn" data-side="yes" style="flex:1;padding:7px;border:none;border-radius:4px;cursor:pointer;font-family:'Source Sans 3',sans-serif;font-weight:600;font-size:12.5px;background:${s.side==='yes'?GN:'transparent'};color:${s.side==='yes'?'#fff':'var(--tx3)'}">Buy YES ${Math.round((m.outcomes[s.selOc]?.price||.5)*100)}¢</button>
        <button class="side-btn" data-side="no" style="flex:1;padding:7px;border:none;border-radius:4px;cursor:pointer;font-family:'Source Sans 3',sans-serif;font-weight:600;font-size:12.5px;background:${s.side==='no'?RD:'transparent'};color:${s.side==='no'?'#fff':'var(--tx3)'}">Buy NO ${Math.round((1-(m.outcomes[s.selOc]?.price||.5))*100)}¢</button>
      </div>
      <input type="number" id="trade-amount" placeholder="Amount ($)" value="${s.amt}" style="margin-bottom:6px">
      <div id="trade-preview" style="font-size:12px;color:var(--tx2);margin-bottom:6px"></div>
      <button class="btn" id="trade-btn" style="width:100%;padding:10px;font-size:13.5px;background:${s.side==='yes'?GN:RD};color:#fff">Buy ${s.side.toUpperCase()}</button>
      <div style="font-size:10px;color:var(--tx3);text-align:center;margin-top:6px">Balance: $${s.portfolio.balance.toLocaleString()}</div>
    </div>`}

    ${marketTrades.length>0?`
      <div style="margin-top:16px">
        <div style="font-size:11px;font-weight:600;color:var(--tx3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Recent Activity</div>
        <div style="background:#F8FAFC;border-radius:8px;border:1px solid var(--bdr);overflow:hidden">
          ${marketTrades.map(t=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px solid #EEF2F7;font-size:12px">
            <div style="display:flex;align-items:center;gap:6px">
              <span class="view-user-btn" data-user="${t.who}" style="font-weight:600;color:${T};cursor:pointer">${t.who}</span>
              <span class="pill" style="background:${t.side==='yes'?'rgba(16,185,129,.07)':'rgba(239,68,68,.07)'};color:${t.side==='yes'?GN:RD};font-size:9px">${t.side.toUpperCase()}</span>
              <span>${t.outcomeLabel}</span>
              <span style="color:var(--tx3)">$${(t.amount||0).toFixed(0)}</span>
            </div>
            <span style="color:var(--tx3);font-size:10.5px">${timeAgo(t.ts)}</span>
          </div>`).join('')}
        </div>
      </div>`:''}

    <div style="margin-top:10px;font-size:10.5px;color:var(--tx3);display:flex;justify-content:space-between"><span>by ${m.creator}</span><span>ends ${new Date(m.endDate).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</span></div>
  </div></div>`;
  document.getElementById('app').insertAdjacentHTML('beforeend',html);

  const amtInput=document.getElementById('trade-amount');
  const preview=document.getElementById('trade-preview');
  const tradeBtn=document.getElementById('trade-btn');
  function updatePreview(){
    const a=parseFloat(amtInput?.value||'0');
    S.amt=amtInput?.value||'';
    if(a>0&&m.outcomes[s.selOc]){
      const est=cpmmBuy(JSON.parse(JSON.stringify(m)),s.selOc,s.side,a);
      const sh=est.shares.toFixed(1),ap=Math.round(est.avgPrice*100);
      if(preview)preview.innerHTML=`<div style="display:flex;justify-content:space-between"><span>${sh} shares @ avg ${ap}¢</span><span style="color:${GN};font-weight:600">Payout if wins: $${est.shares.toFixed(0)}</span></div>`;
      if(tradeBtn)tradeBtn.textContent=`Buy ${s.side.toUpperCase()} · $${S.amt}`;
    }else{
      if(preview)preview.innerHTML='';
      if(tradeBtn)tradeBtn.textContent=`Buy ${s.side.toUpperCase()}`;
    }
  }
  if(amtInput){amtInput.addEventListener('input',updatePreview);updatePreview()}

  document.getElementById('close-detail').onclick=()=>{S.sel=null;render()};
  document.getElementById('detail-overlay').onclick=e=>{if(e.target===e.currentTarget){S.sel=null;render()}};
  document.querySelectorAll('.outcome-row').forEach(el=>{el.onclick=()=>{if(!S.sel.resolved){S.selOc=parseInt(el.dataset.idx);S.side='yes';render()}}});
  document.querySelectorAll('.chart-toggle').forEach(el=>{
    el.onclick=e=>{
      e.stopPropagation();
      const j=el.dataset.oc;
      const panel=document.querySelector(`.chart-panel[data-oc="${j}"]`);
      if(panel){
        const showing=panel.style.display!=='none';
        panel.style.display=showing?'none':'block';
        el.style.background=showing?'#F1F5F9':'var(--tl)';
        el.style.borderColor=showing?'var(--bdr)':T;
        el.style.color=showing?'var(--tx3)':T;
        if(!showing){
          // Mount chart when first shown
          const oc=m.outcomes[parseInt(j)];
          const w2=m.resolved&&m.winnerIdx===parseInt(j);
          if(oc&&oc.history&&oc.history.length>1){
            setTimeout(()=>mountInteractiveChart('chart-'+j,oc.history,w2?GN:T,marketTrades,oc.label),50);
          }
        }
      }
    };
  });
  // Mount charts that are visible by default (binary markets)
  m.outcomes.forEach((o,j)=>{
    const panel=document.querySelector(`.chart-panel[data-oc="${j}"]`);
    if(panel&&panel.style.display!=='none'&&o.history&&o.history.length>1){
      const w2=m.resolved&&m.winnerIdx===j;
      mountInteractiveChart('chart-'+j,o.history,w2?GN:T,marketTrades,o.label);
    }
  });
  document.querySelectorAll('.side-btn').forEach(el=>{el.onclick=e=>{e.stopPropagation();S.side=el.dataset.side;render()}});
  if(tradeBtn)tradeBtn.onclick=trade;
  if(document.getElementById('edit-market-btn'))document.getElementById('edit-market-btn').onclick=()=>{
    S.editing=S.sel;S.editForm={title:S.sel.title,desc:S.sel.description,end:S.sel.endDate,outcomes:S.sel.outcomes.map(o=>o.label)};render()};
  if(document.getElementById('resolve-market-btn'))document.getElementById('resolve-market-btn').onclick=()=>{S.resolving=S.sel;render()};
}

function mountCreate(){
  const f=S.form;
  let html=`<div class="overlay" id="create-overlay"><div class="modal">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><h2 style="font-size:16.5px;font-weight:700">Create a New Market</h2><button class="xbtn" id="close-create">×</button></div>
    <p style="font-size:12.5px;color:var(--tx2);margin-bottom:16px;line-height:1.5">Each outcome can be traded YES or NO — prices normalise to 100%.</p>
    <div style="display:flex;flex-direction:column;gap:12px">
      <div><label style="font-size:11px;color:var(--tx2);margin-bottom:4px;display:block;font-weight:600">Question *</label><input id="f-title" placeholder="e.g. How many OKR meetings in Q3?" value="${f.title}"></div>
      <div><label style="font-size:11px;color:var(--tx2);margin-bottom:4px;display:block;font-weight:600">Resolution Criteria</label><textarea id="f-desc" rows="2" placeholder="How does this resolve?" style="resize:vertical">${f.desc}</textarea></div>
      <div><label style="font-size:11px;color:var(--tx2);margin-bottom:6px;display:block;font-weight:600">Outcomes *</label>
        <div style="display:flex;flex-direction:column;gap:5px">${f.outcomes.map((o,i)=>`<div style="display:flex;gap:6px;align-items:center"><span class="m" style="font-size:10.5px;color:var(--tx3);min-width:18px">${i+1}.</span><input class="outcome-input" data-idx="${i}" placeholder="Outcome ${i+1}" value="${o}" style="flex:1">${f.outcomes.length>2?`<button class="remove-outcome" data-idx="${i}" style="background:none;border:none;cursor:pointer;color:var(--tx3);font-size:15px;padding:0 3px">×</button>`:''}</div>`).join('')}</div>
        <button id="add-outcome" style="background:none;border:1px dashed #D1D9E6;border-radius:5px;padding:6px;cursor:pointer;font-size:12px;color:var(--tx2);font-family:'Source Sans 3',sans-serif;width:100%;margin-top:5px">+ Add outcome</button></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div><label style="font-size:11px;color:var(--tx2);margin-bottom:4px;display:block;font-weight:600">Category</label><select id="f-cat">${CATS.filter(c=>c!=='All').map(c=>`<option value="${c}" ${f.cat===c?'selected':''}>${CI[c]} ${c}</option>`).join('')}</select></div>
        <div><label style="font-size:11px;color:var(--tx2);margin-bottom:4px;display:block;font-weight:600">End Date *</label><input type="date" id="f-end" value="${f.end}"></div></div>
      <button class="btn btn-t" id="create-btn" style="width:100%;padding:11px;font-size:13.5px;margin-top:2px">Create Market</button>
    </div></div></div>`;
  document.getElementById('app').insertAdjacentHTML('beforeend',html);
  document.getElementById('close-create').onclick=()=>{S.creating=false;render()};
  document.getElementById('create-overlay').onclick=e=>{if(e.target===e.currentTarget){S.creating=false;render()}};
  document.getElementById('f-title').oninput=e=>{S.form.title=e.target.value};
  document.getElementById('f-desc').oninput=e=>{S.form.desc=e.target.value};
  document.getElementById('f-cat').onchange=e=>{S.form.cat=e.target.value};
  document.getElementById('f-end').onchange=e=>{S.form.end=e.target.value};
  document.querySelectorAll('.outcome-input').forEach(el=>{el.oninput=e=>{S.form.outcomes[parseInt(el.dataset.idx)]=e.target.value}});
  document.querySelectorAll('.remove-outcome').forEach(el=>{el.onclick=()=>{S.form.outcomes.splice(parseInt(el.dataset.idx),1);render()}});
  document.getElementById('add-outcome').onclick=()=>{S.form.outcomes.push('');render()};
  document.getElementById('create-btn').onclick=createMarket;
}

function mountEdit(){
  const ef=S.editForm;
  let html=`<div class="overlay" id="edit-overlay"><div class="modal">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><h2 style="font-size:16.5px;font-weight:700">Edit Market</h2><button class="xbtn" id="close-edit">×</button></div>
    <div style="display:flex;flex-direction:column;gap:12px">
      <div><label style="font-size:11px;color:var(--tx2);margin-bottom:4px;display:block;font-weight:600">Question</label><input id="ef-title" value="${ef.title}"></div>
      <div><label style="font-size:11px;color:var(--tx2);margin-bottom:4px;display:block;font-weight:600">Description</label><textarea id="ef-desc" rows="2" style="resize:vertical">${ef.desc}</textarea></div>
      <div><label style="font-size:11px;color:var(--tx2);margin-bottom:6px;display:block;font-weight:600">Outcomes</label>
        <div style="display:flex;flex-direction:column;gap:5px">${ef.outcomes.map((o,i)=>`<div style="display:flex;gap:6px;align-items:center"><span class="m" style="font-size:10.5px;color:var(--tx3);min-width:18px">${i+1}.</span><input class="edit-outcome" data-idx="${i}" value="${o}" style="flex:1">${ef.outcomes.length>2?`<button class="rm-edit-oc" data-idx="${i}" style="background:none;border:none;cursor:pointer;color:var(--tx3);font-size:15px;padding:0 3px">×</button>`:''}</div>`).join('')}</div>
        <button id="add-edit-oc" style="background:none;border:1px dashed #D1D9E6;border-radius:5px;padding:6px;cursor:pointer;font-size:12px;color:var(--tx2);font-family:'Source Sans 3',sans-serif;width:100%;margin-top:5px">+ Add outcome</button></div>
      <div><label style="font-size:11px;color:var(--tx2);margin-bottom:4px;display:block;font-weight:600">End Date</label><input type="date" id="ef-end" value="${ef.end}"></div>
      <button class="btn btn-t" id="save-edit-btn" style="width:100%;padding:11px;font-size:13.5px">Save Changes</button>
    </div></div></div>`;
  document.getElementById('app').insertAdjacentHTML('beforeend',html);
  document.getElementById('close-edit').onclick=()=>{S.editing=null;render()};
  document.getElementById('edit-overlay').onclick=e=>{if(e.target===e.currentTarget){S.editing=null;render()}};
  document.getElementById('ef-title').oninput=e=>{S.editForm.title=e.target.value};
  document.getElementById('ef-desc').oninput=e=>{S.editForm.desc=e.target.value};
  document.getElementById('ef-end').onchange=e=>{S.editForm.end=e.target.value};
  document.querySelectorAll('.edit-outcome').forEach(el=>{el.oninput=e=>{S.editForm.outcomes[parseInt(el.dataset.idx)]=e.target.value}});
  document.querySelectorAll('.rm-edit-oc').forEach(el=>{el.onclick=()=>{S.editForm.outcomes.splice(parseInt(el.dataset.idx),1);render()}});
  document.getElementById('add-edit-oc').onclick=()=>{S.editForm.outcomes.push('');render()};
  document.getElementById('save-edit-btn').onclick=saveEdit;
}

function mountResolve(){
  const m=S.resolving;
  let html=`<div class="overlay" id="resolve-overlay"><div class="modal">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px"><h2 style="font-size:16.5px;font-weight:700">🏁 Resolve Market</h2><button class="xbtn" id="close-resolve">×</button></div>
    <p style="font-size:13px;font-weight:600;margin-bottom:4px">${m.title}</p>
    <p style="font-size:12.5px;color:var(--tx3);margin-bottom:18px;line-height:1.5">Select the winner. <strong>Permanent.</strong> Winners get $1/share, losers $0.</p>
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:18px">
      ${m.outcomes.map((o,j)=>`<button class="resolve-btn" data-idx="${j}" style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-radius:8px;border:2px solid var(--bdr);background:#F8FAFC;cursor:pointer;font-family:'Source Sans 3',sans-serif;font-size:14px;font-weight:600;color:var(--tx);transition:all .12s"><span>${o.label}</span><span class="m" style="font-size:14px;color:${T}">${Math.round(o.price*100)}¢</span></button>`).join('')}
    </div>
    <div style="border-top:1px solid var(--bdr);padding-top:14px;display:flex;gap:8px">
      <button class="btn" id="cancel-market-btn" style="background:#FEF3C7;color:#92400E;flex:1;font-size:12px">Cancel (refund all)</button>
      <button class="btn" id="delete-market-btn" style="background:rgba(239,68,68,.08);color:${RD};flex:1;font-size:12px">Delete Market</button>
    </div></div></div>`;
  document.getElementById('app').insertAdjacentHTML('beforeend',html);
  document.getElementById('close-resolve').onclick=()=>{S.resolving=null;render()};
  document.getElementById('resolve-overlay').onclick=e=>{if(e.target===e.currentTarget){S.resolving=null;render()}};
  document.querySelectorAll('.resolve-btn').forEach(el=>{
    el.onmouseenter=()=>{el.style.borderColor=GN;el.style.background='#F0FDF4'};
    el.onmouseleave=()=>{el.style.borderColor='var(--bdr)';el.style.background='#F8FAFC'};
    el.onclick=()=>{if(confirm('Resolve: "'+m.outcomes[parseInt(el.dataset.idx)].label+'" wins?'))resolveMarket(parseInt(el.dataset.idx))}});
  document.getElementById('cancel-market-btn').onclick=()=>{if(confirm('Cancel and refund all?'))cancelMarket()};
  document.getElementById('delete-market-btn').onclick=()=>{if(confirm('Permanently delete?'))deleteMarket(m.id)};
}

function bindEvents(){
  document.querySelectorAll('.tab').forEach(el=>{el.onclick=()=>{S.view=el.dataset.view;render()}});
  document.getElementById('logo-click')?.addEventListener('click',()=>{S.view='league';render()});
  document.getElementById('new-market-btn')?.addEventListener('click',()=>{S.creating=true;render()});
  document.getElementById('first-market-btn')?.addEventListener('click',()=>{S.creating=true;render()});
  document.getElementById('search-input')?.addEventListener('input',e=>{S.q=e.target.value;render()});
  document.getElementById('sort-select')?.addEventListener('change',e=>{S.sort=e.target.value;render()});
  document.querySelectorAll('.cat-btn').forEach(el=>{el.onclick=()=>{S.cat=el.dataset.cat;render()}});
  document.querySelectorAll('.sell-pos-btn').forEach(el=>{
    el.onclick=e=>{e.stopPropagation();const idx=parseInt(el.dataset.posIdx);if(confirm('Sell this position?'))sellPosition(idx)};
  });
  document.querySelectorAll('[data-market-id]').forEach(el=>{
    el.onclick=()=>{const m=S.markets.find(x=>x.id===parseInt(el.dataset.marketId));if(m){S.sel=m;S.selOc=0;S.side='yes';S.amt='';render()}}});

  // View user profile (available everywhere)
  document.querySelectorAll('.view-user-btn').forEach(el=>{
    el.onclick=e=>{
      e.stopPropagation();
      S.viewingUser=el.dataset.user;render();
    };
  });

  // Admin panel events
  document.querySelectorAll('.add-funds-btn').forEach(el=>{
    el.onclick=e=>{e.stopPropagation();S.addFundsUser=el.dataset.user;S.addFundsAmt='';render()}});
  document.querySelectorAll('.admin-delete-btn').forEach(el=>{
    el.onclick=e=>{e.stopPropagation();adminDeleteUser(el.dataset.user)}});
  document.getElementById('admin-add-user-btn')?.addEventListener('click',()=>{S.addingUser=true;render()});

  // Admin: editable balance (click to edit)
  document.querySelectorAll('.admin-balance-edit').forEach(el=>{
    el.onclick=e=>{
      e.stopPropagation();
      S.editingBalance=el.dataset.user;
      S.editBalanceVal=el.textContent.replace('$','').replace(/,/g,'');
      render();
      // Focus the input after render
      setTimeout(()=>{
        const inp=document.querySelector(`.admin-balance-input[data-user="${el.dataset.user}"]`);
        if(inp){inp.focus();inp.select()}
      },50);
    };
  });
  // Admin: balance input handlers
  document.querySelectorAll('.admin-balance-input').forEach(el=>{
    el.onkeydown=e=>{
      if(e.key==='Enter'){adminSetBalance(el.dataset.user,el.value)}
      if(e.key==='Escape'){S.editingBalance=null;render()}
    };
    el.onblur=()=>{adminSetBalance(el.dataset.user,el.value)};
  });

  if(document.getElementById('add-funds-amount'))
    document.getElementById('add-funds-amount').addEventListener('input',e=>{S.addFundsAmt=e.target.value});
  if(document.getElementById('add-funds-btn'))
    document.getElementById('add-funds-btn').onclick=adminAddFunds;
  if(document.getElementById('cancel-funds-btn'))
    document.getElementById('cancel-funds-btn').onclick=()=>{S.addFundsUser=null;render()};

  // Season events
  if(document.getElementById('end-season-btn'))
    document.getElementById('end-season-btn').onclick=()=>{S.endingSeasonModal=true;render()};
  if(document.getElementById('start-season-btn'))
    document.getElementById('start-season-btn').onclick=()=>{const label=prompt('Season name?','Season '+(S.seasons.length+1));if(label!==null)startNewSeason(label)};
}

// Start
initActivityLog();
init();
setTimeout(()=>{if(S.name)checkPayouts()},2000);

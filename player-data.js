const EVENT_CONFIG={championship:{label:'Scrabble Lanka Championship',rounds:16,prefix:'rounds'},plate:{label:'Scrabble Lanka Plate Event',rounds:7,prefix:'plate'},u12:{label:'Scrabble Lanka Under 12 Event',rounds:6,prefix:'u12'}};

function cleanId(v){return String(v||'').trim().replace(/^#/,'');}
function parseLastGame(text){
  const t=String(text||'').replace(/\s+/g,' ').trim();
  const m=t.match(/^(?:\?\s*)?(?:\d+)?([WLT])\s*:\s*(\d+)\s*[−-]\s*(\d+)\s*:\s*#?([A-Za-z0-9_-]+)$/i);
  if(!m)return null;
  return {result:m[1].toUpperCase(),score:Number(m[2]),oppScore:Number(m[3]),opponentId:cleanId(m[4])};
}

async function fetchRound(event,round){
  const cfg=EVENT_CONFIG[event];
  const url=`${cfg.prefix}/round-${String(round).padStart(2,'0')}-standings.html?cb=${Date.now()}`;
  try{
    const r=await fetch(url,{cache:'no-store'});
    if(!r.ok)return null;
    return await r.text();
  }catch(e){return null}
}

function parseStandings(html,round,players){
  const doc=new DOMParser().parseFromString(html,'text/html');
  const rows=[...doc.querySelectorAll('table.standings tr')];
  for(const row of rows){
    const nameCell=row.querySelector('td.name');
    const lastCell=row.querySelector('td.last');
    if(!nameCell||!lastCell)continue;
    const link=nameCell.querySelector('a[href*="id="]');
    let id=link?.getAttribute('href')?.match(/[?&]id=([^&#]+)/)?.[1]||'';
    id=cleanId(id);
    if(!id){
      const raw=nameCell.textContent||'';
      const im=raw.match(/#?([A-Za-z]?\d+)\s*\)?\s*$/);
      if(im)id=cleanId(im[1]);
    }
    const name=(link?.textContent||nameCell.textContent||'').replace(/\s*\(?#?[A-Za-z]?\d+\)?\s*$/,'').trim();
    const game=parseLastGame(lastCell.textContent);
    if(!id||!name||!game)continue;
    if(!players[id])players[id]={id,name,games:[]};
    else if(name)players[id].name=name;
    players[id].games.push({round,id,name,result:game.result,score:game.score,oppScore:game.oppScore,opponentId:game.opponentId,spread:game.score-game.oppScore});
  }
}

async function buildDatabase(event){
  const cfg=EVENT_CONFIG[event]||EVENT_CONFIG.championship;
  const players={};
  const docs=await Promise.all(Array.from({length:cfg.rounds},(_,i)=>fetchRound(event,i+1)));
  docs.forEach((html,i)=>{if(html)parseStandings(html,i+1,players)});
  for(const p of Object.values(players)){
    for(const g of p.games){g.opponentName=players[g.opponentId]?.name||`Player ${g.opponentId}`;}
    p.games.sort((a,b)=>a.round-b.round);
  }
  return {event,updated:new Date().toISOString(),players};
}

async function getDatabase(event){return buildDatabase(event);}
async function getPlayers(event){const db=await getDatabase(event);return Object.values(db.players)}
async function getPlayer(event,id){const db=await getDatabase(event);return db.players[cleanId(id)]||null}

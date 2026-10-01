import { createMarketCore, createScenario, encodeExact } from '../../packages/sim-core/src/index.ts';
import type { AdvanceRequest, Command, CommandBody, PublicQuery, SnapshotEnvelope, ExactValue,
  ScenarioInput, Intent, TradingCore, TradingDiagnostics } from '../../packages/sim-core/src/index.ts';

export type ReplayAction =
  | { op:'prepare' }
  | { op:'advance'; request:AdvanceRequest }
  | { op:'submit'; accountId:string; id:string; body:CommandBody; publicVersion?:number; target?:Command['target'] }
  | { op:'intents'; accountId:string; id:string; intents:Intent[]; submit?:boolean }
  | { op:'targetGap'; accountId:string; stockId:string; targetShares:number }
  | { op:'participant'; accountId:string; id:string; stockId:string; messageId:string;
      quantity:number; beforePrice:number; afterPrice:number }
  | { op:'read'; accountId?:string; query:PublicQuery; repeat?:number }
  | { op:'snapshot'; label:string }
  | { op:'restore'; label:string };
export type ReplayFixture = { id:string; ac:number[]; description:string; input:ScenarioInput;
  commands:ReplayAction[]; expected:Record<string,unknown> };

/** Thin adapter shared by Node and the actual browser Worker. All trades,
 * clocks, reservations, fees and snapshots belong to the production core. */
export function runReplay(input:ScenarioInput|SnapshotEnvelope, actions:ReplayAction[], inspect?:(diagnostics:TradingDiagnostics)=>void) {
  let core:TradingCore;
  if('payload'in input){core=createMarketCore();const restored=core.restoreSnapshot(input);if(!restored.restored)throw new Error(`restore ${restored.reason}: ${restored.detail}`);}
  else core=createScenario(input);
  const orderRefs=new Map<string,string>();const snapshots:{label:string;snapshot:SnapshotEnvelope}[]=[];
  const steps:{index:number;operation:string;result:unknown;stateHash:string}[]=[];
  inspect?.(core.diagnostics());
  const submit=(accountId:string,id:string,body:CommandBody,version?:number,target?:Command['target'])=>{
    const publicView=core.readFor(accountId,{kind:'portfolio'});
    const resolved=body.kind==='cancel'&&body.orderId.startsWith('$')?{...body,orderId:orderRefs.get(body.orderId.slice(1))??body.orderId}:body;
    const receipt=core.submitFor(accountId,{id,body:resolved,publicVersion:version??publicView.publicVersion,target:target??publicView.clock});
    if(receipt.accepted&&receipt.orderId)orderRefs.set(id,receipt.orderId);
    return receipt;
  };
  for(let index=0;index<actions.length;index++){
    const action=actions[index]!;let result:unknown;
    try {
    if(action.op==='prepare')result=core.prepareNextBatch();
    else if(action.op==='advance'){
      if(!inspect)result=core.advance(action.request);
      else {
        // Verification observes every real atomic batch. It asks the same core
        // for one batch at a time; it does not apply ledger transitions itself.
        let completedBatches=0;
        let reply;
        do {
          reply=core.advance({...action.request,maxBatches:Math.min(1,action.request.maxBatches-completedBatches)});
          completedBatches+=reply.completedBatches;inspect(core.diagnostics());
        }while(reply.reason==='budget'&&completedBatches<action.request.maxBatches);
        result={...reply,completedBatches};
      }
    }
    else if(action.op==='submit')result=submit(action.accountId,action.id,action.body,action.publicVersion,action.target);
    else if(action.op==='targetGap')result=core.targetGap(action.accountId,action.stockId,action.targetShares);
    else if(action.op==='intents'){
      const converted=core.convertIntents(action.accountId,action.intents);
      result={converted,receipts:action.submit?converted.map((intent,i)=>submit(action.accountId,`${action.id}-${i}`,{kind:'immediate',stockId:intent.stockId,side:intent.side,quantity:intent.quantity,limitPrice:intent.limitPrice})):[]};
    }else if(action.op==='participant'){
      // This participant receives public data and its own account only. The
      // fixture's private publications/other wallets are never its input.
      const publicView=core.readFor(action.accountId,{kind:'portfolio'});
      const sawMessage=publicView.messages.some(m=>m.id===action.messageId);
      const body:CommandBody={kind:'immediate',stockId:action.stockId,side:'buy',quantity:action.quantity,limitPrice:sawMessage?action.afterPrice:action.beforePrice};
      result={publicInput:publicView,sawMessage,receipt:submit(action.accountId,action.id,body,publicView.publicVersion,publicView.clock)};
    }else if(action.op==='read'){
      for(let i=0;i<(action.repeat??1);i++)result=action.accountId?core.readFor(action.accountId,action.query):core.readPublicView(action.query);
    }else if(action.op==='snapshot'){
      const snapshot=core.exportSnapshot();snapshots.push({label:action.label,snapshot});result={label:action.label,checksum:snapshot.checksum,phase:snapshot.phase,clock:snapshot.clock};
    }else if(action.op==='restore'){
      const checkpoint=snapshots.find(s=>s.label===action.label);if(!checkpoint)throw new Error(`unknown checkpoint ${action.label}`);
      result=core.restoreSnapshot(checkpoint.snapshot);
    }else throw new Error('unknown replay operation');
    steps.push({index,operation:action.op,result,stateHash:core.diagnostics().stateHash});
    inspect?.(core.diagnostics());
    } catch(error) {
      throw new Error(`replay action ${index} (${action?.op??'missing'}): ${error instanceof Error?error.message:'invalid action'}`,{cause:error});
    }
  }
  return {steps,snapshots,finalSnapshot:core.exportSnapshot(),publicView:core.readPublicView({kind:'market'}),diagnostics:core.diagnostics()};
}

/** Stable full output; timing, host paths and rendering are excluded. */
export function canonicalReplay(input:ScenarioInput|SnapshotEnvelope,actions:ReplayAction[]):string {
  return encodeExact(runReplay(input,actions) as unknown as ExactValue);
}

import {reviewer} from './roles.js';

// Personal work is linked to an account, never inferred from a name or role label.
export const isMyAction=(action,user)=>!!user?.id&&action.assignedTo===user.id;
export const myActions=(state,garage,user)=>(state.actions||[]).filter(a=>a.garage===garage&&!a.deletedAt&&isMyAction(a,user));
export const myActionCount=(state,garage,user)=>myActions(state,garage,user).filter(a=>a.status!=='Closed').length;
export const canWorkAction=(action,user)=>reviewer(user)||isMyAction(action,user);
export const visibleActionState=(state,user)=>reviewer(user)?state:{...state,actions:(state.actions||[]).filter(a=>isMyAction(a,user))};

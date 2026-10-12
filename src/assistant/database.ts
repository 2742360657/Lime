export { database } from '../storage/database';
export type DocumentContent={title:string;body:string;date:string;group_id?:string|null};
export function localDate() {const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}

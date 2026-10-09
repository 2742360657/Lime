export type ChatDocument={id:string;kind:string;title:string;date:string;revision:number};
export type ChatAttachment={id:string;filename:string;mime:string;size:number;status:string};
export type ProposalItem={title:string;note:string;due_date:string;source_id:string};
export type TaskProposal={id:string;summary:string;items:ProposalItem[];sources:{id:string;filename:string}[];status:string};
export type ChatMessage={id:string;role:'user'|'assistant';text:string;attachments?:ChatAttachment[];documents?:ChatDocument[];proposals?:TaskProposal[]};
export type PendingFile={local_id:string;uri:string;name:string;size:number;uploaded?:ChatAttachment};

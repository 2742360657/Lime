import type { DomainDatabase } from '../domain/types';

export type SourceSnapshot = { id: string; title: string; body: string; revision: number; date: string; kind: string; document_id: string };

// Accepted previews, autonomous commits, and restored results all retain evidence.
// Grants also cover a crash after commit but before the result cache was saved.
export async function loadRecordSources(db: DomainDatabase, kind: 'task' | 'memo' | 'record', id: string): Promise<SourceSnapshot[]> {
  return db.readTransaction(async tx => {
    const requests = await tx.getAll<{request_id: string}>(`
      SELECT request_id,MAX(created_at) AS newest FROM (
        SELECT request_id,receipt,created_at FROM local_proposals WHERE status='accepted' AND receipt IS NOT NULL
        UNION ALL
        SELECT request_id,json_extract(result,'$.receipt') AS receipt,created_at FROM local_agent_results
          WHERE json_extract(result,'$.status')='saved' AND json_extract(result,'$.receipt') IS NOT NULL
        UNION ALL
        SELECT g.request_id,g.receipt,r.created_at FROM local_agent_grants g
          JOIN local_agent_requests r ON r.id=g.request_id WHERE g.receipt IS NOT NULL
      ) evidence WHERE json_extract(receipt,'$.entity.kind')=? AND json_extract(receipt,'$.entity.id')=?
        AND EXISTS(SELECT 1 FROM local_agent_sources s WHERE s.request_id=evidence.request_id)
      GROUP BY request_id ORDER BY newest DESC,request_id LIMIT 10`, [kind, id]);
    if (!requests.length) return [];
    return tx.getAll<SourceSnapshot>(`SELECT * FROM local_agent_sources WHERE request_id IN (${requests.map(() => '?').join(',')}) ORDER BY request_id,id`, requests.map(r => r.request_id));
  });
}

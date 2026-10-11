import { z } from 'zod';

// Keep these independent from domain/commands: that module includes this union.
const id = z.string().trim().min(1).max(160);
const revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const content = {
  title: z.string().max(300).default(''),
  body: z.string().max(100000).default(''),
  groupId: id.nullable().default(null),
};

export const memoCommandSchemas = [
  z.strictObject({ type: z.literal('memo.create'), ...content }).refine(
    value => Boolean(value.title.trim() || value.body.trim()),
    { message: 'A memo requires a title or body' },
  ),
  // Full content, rather than an arbitrary patch, makes confirmation reviewable.
  z.strictObject({ type: z.literal('memo.update'), id, expectedRevision: revision,
    title: z.string().max(300), body: z.string().max(100000), groupId: id.nullable(),
  }),
  z.strictObject({ type: z.literal('memo.trash'), id, expectedRevision: revision }),
  z.strictObject({ type: z.literal('memo.restore'), id, expectedRevision: revision }),
] as const;

export const memoCommandSchema = z.discriminatedUnion('type', memoCommandSchemas);
export type MemoCommand = z.infer<typeof memoCommandSchema>;

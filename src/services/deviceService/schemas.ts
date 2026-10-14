import { z } from 'zod'

/** The device record as read back from storage, which is untrusted. */
export const deviceRecordSchema = z.object({
  datasetId: z.string().min(1),
  userPersonId: z.string().min(1).nullable(),
  owner: z
    .object({ accountId: z.string().min(1), email: z.string().min(1) })
    .nullable(),
})

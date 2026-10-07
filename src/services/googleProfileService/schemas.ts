import { z } from 'zod'

export const userInfoSchema = z.object({
  sub: z.string(),
  email: z.string(),
  name: z.string().optional(),
  picture: z.string().optional(),
})

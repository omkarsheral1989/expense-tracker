/** Which Sync a button starts, and where it sits. */
export type SyncButtonProps = {
  /** Sync only this group (the group page's button); left out, the button syncs everything and backs up. */
  group?: { id: string; name: string }
  /** True on a group's colored band: a white round button like the band's others. False in the header: outlined. */
  onBand?: boolean
}

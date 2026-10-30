/**
 * Deleting a group on this device (PRD 5.22, ADR-069) is behind a flag, off unless VITE_ENABLE_DELETE_GROUP=true. Off, there is no
 * Delete button on a group and no "Deleted groups" entry in the avatar menu; groups already deleted stay hidden.
 */
export const DELETE_GROUP_ENABLED = import.meta.env.VITE_ENABLE_DELETE_GROUP === 'true'

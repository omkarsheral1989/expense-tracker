import { AccountKindIcon } from '../AccountKindIcon'

/** The size of each tile of the picture, in pixels. */
const TILE_SIZE = 72

/**
 * The picture of the accounts page's empty state: a credit card tile and a bank tile, overlapping and turned a little
 * the other way, in the colors the accounts use. Drawn from the same tiles as the list, so there is no image to load.
 */
export function AccountsIllustration() {
  return (
    <div aria-hidden style={{ position: 'relative', width: TILE_SIZE * 1.8, height: TILE_SIZE * 1.3, margin: '0 auto 20px' }}>
      <div style={{ position: 'absolute', right: 0, top: 0, transform: 'rotate(10deg)' }}>
        <AccountKindIcon kind="card" size={TILE_SIZE} />
      </div>
      <div style={{ position: 'absolute', left: 0, bottom: 0, transform: 'rotate(-8deg)', boxShadow: '0 6px 16px rgba(0, 0, 0, 0.18)', borderRadius: 10 }}>
        <AccountKindIcon kind="bank" size={TILE_SIZE} />
      </div>
    </div>
  )
}

import { BRAND } from '@/brand'
import { cn } from '@/lib/utils'

const assetPath = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`

// Brand badge on a white tile, identical in light/dark. The mark asset comes
// from the brand config (src/brand.ts); the engine's nous-girl mark is the
// fallback until final branding lands. Fills the tile (softly rounded); size
// via className (default size-14).
export function BrandMark({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        'inline-flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white',
        className
      )}
      {...props}
    >
      <img alt="" className="size-full object-contain" src={assetPath(BRAND.markAsset ?? 'nous-girl.jpg')} />
    </span>
  )
}

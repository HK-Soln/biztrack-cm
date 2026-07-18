import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        background: '#16467A',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 40,
        gap: 4,
        position: 'relative',
      }}
    >
      <div
        style={{
          color: '#fff',
          fontSize: 96,
          fontWeight: 800,
          fontFamily: 'sans-serif',
          lineHeight: 1,
          letterSpacing: '-2px',
        }}
      >
        B
      </div>
      <div
        style={{
          color: '#F4A62A',
          fontSize: 18,
          fontWeight: 600,
          fontFamily: 'sans-serif',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
        }}
      >
        BIZTRACK CM
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 26,
          right: 26,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: '#F4A62A',
        }}
      />
    </div>,
    { ...size },
  )
}

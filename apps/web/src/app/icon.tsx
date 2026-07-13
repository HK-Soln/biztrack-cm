import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        background: '#16467A',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 7,
        position: 'relative',
      }}
    >
      <div
        style={{
          color: '#fff',
          fontSize: 20,
          fontWeight: 800,
          fontFamily: 'sans-serif',
          lineHeight: 1,
          letterSpacing: '-0.5px',
        }}
      >
        B
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 4,
          right: 4,
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: '#F4A62A',
        }}
      />
    </div>,
    { ...size },
  )
}

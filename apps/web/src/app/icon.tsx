import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(145deg, #0D2B1F 0%, #06140F 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 7,
          border: '1px solid rgba(29,158,117,0.35)',
        }}
      >
        <div
          style={{
            color: '#1D9E75',
            fontSize: 20,
            fontWeight: 800,
            fontFamily: 'serif',
            lineHeight: 1,
            letterSpacing: '-0.5px',
          }}
        >
          B
        </div>
      </div>
    ),
    { ...size },
  )
}

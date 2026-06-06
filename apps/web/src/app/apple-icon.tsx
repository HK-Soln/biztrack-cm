import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(145deg, #0D2B1F 0%, #06140F 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 40,
          gap: 4,
        }}
      >
        <div
          style={{
            color: '#1D9E75',
            fontSize: 96,
            fontWeight: 800,
            fontFamily: 'serif',
            lineHeight: 1,
            letterSpacing: '-2px',
          }}
        >
          B
        </div>
        <div
          style={{
            color: '#5A8A74',
            fontSize: 18,
            fontWeight: 600,
            fontFamily: 'sans-serif',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
          }}
        >
          BIZTRACK CM
        </div>
      </div>
    ),
    { ...size },
  )
}

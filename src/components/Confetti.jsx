import React, { useEffect, useState } from 'react'
import './Confetti.css'

const COLORS = ['#58CC02', '#1CB0F6', '#CE82FF', '#FF9600', '#FFC800', '#FF4B4B']
const PIECES = 50

export default function Confetti({ active }) {
  const [pieces, setPieces] = useState([])

  useEffect(() => {
    if (!active) { setPieces([]); return }
    const arr = []
    for (let i = 0; i < PIECES; i++) {
      arr.push({
        id: i,
        color: COLORS[i % COLORS.length],
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        duration: 1 + Math.random() * 2,
        size: 6 + Math.random() * 8,
        rotation: Math.random() * 360,
        xDrift: (Math.random() - 0.5) * 80,
      })
    }
    setPieces(arr)
    const timer = setTimeout(() => setPieces([]), 3500)
    return () => clearTimeout(timer)
  }, [active])

  if (pieces.length === 0) return null

  return (
    <div className="confetti-container" aria-hidden="true">
      {pieces.map(p => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            background: p.color,
            width: `${p.size}px`,
            height: `${p.size * 0.6}px`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            '--x-drift': `${p.xDrift}px`,
            '--rotation': `${p.rotation}deg`,
          }}
        />
      ))}
    </div>
  )
}

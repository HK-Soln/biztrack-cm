'use client'

import { useEffect } from 'react'

/**
 * Client-side behaviour for the marketing site — a faithful port of the design's
 * site.js. All page/header/footer markup is server-rendered (plain server components,
 * not React-hydrated), so wiring interactions imperatively here is safe: React never
 * reconciles those nodes, so the language swap (innerHTML) and class toggles stick.
 *
 * Mirrors the original: EN/FR toggle · mobile drawer · sticky-header shadow ·
 * reveal-on-scroll · FAQ accordion · pricing cycle toggle · contact-form success.
 */
const LANG_KEY = 'biztrack-site-lang'

export function SiteChrome() {
  useEffect(() => {
    const cleanups: Array<() => void> = []

    /* ---------- i18n (EN/FR) ---------- */
    function applyLang(lang: string) {
      document.documentElement.setAttribute('lang', lang)
      document.querySelectorAll<HTMLElement>('[data-en]').forEach((n) => {
        const v = n.getAttribute('data-' + lang)
        if (v == null) return
        const attr = n.getAttribute('data-i18n-attr')
        if (attr) n.setAttribute(attr, v)
        else n.innerHTML = v
      })
      document.querySelectorAll<HTMLElement>('[data-ph-en]').forEach((n) => {
        n.setAttribute('placeholder', n.getAttribute('data-ph-' + lang) || '')
      })
      document.querySelectorAll<HTMLElement>('.lang-tog button').forEach((b) => {
        b.classList.toggle('on', b.getAttribute('data-lang') === lang)
      })
      // keep pricing labels/amounts consistent with the active cycle after a language swap
      const activeCycleBtn = document.querySelector('[data-price-seg] button.on')
      if (activeCycleBtn) {
        const cycle = activeCycleBtn.getAttribute('data-cycle')
        document.querySelectorAll<HTMLElement>('[data-mo]').forEach((n) => {
          n.textContent = n.getAttribute('data-' + cycle) || ''
        })
        document.querySelectorAll<HTMLElement>('[data-per-mo]').forEach((n) => {
          n.innerHTML =
            n.getAttribute('data-per-' + cycle + '-' + lang) ||
            n.getAttribute('data-per-' + cycle) ||
            n.innerHTML
        })
      }
      try {
        localStorage.setItem(LANG_KEY, lang)
      } catch {
        /* ignore */
      }
    }
    let saved = 'en'
    try {
      saved = localStorage.getItem(LANG_KEY) || 'en'
    } catch {
      /* ignore */
    }
    applyLang(saved)
    const onLangClick = (e: MouseEvent) => {
      const b = (e.target as HTMLElement)?.closest('.lang-tog button')
      if (b) applyLang(b.getAttribute('data-lang') || 'en')
    }
    document.addEventListener('click', onLangClick)
    cleanups.push(() => document.removeEventListener('click', onLangClick))

    /* ---------- active nav ---------- */
    const path = window.location.pathname.replace(/\/$/, '') || '/'
    document.querySelectorAll<HTMLAnchorElement>('.main-nav a, .m-drawer nav a').forEach((a) => {
      const href = (a.getAttribute('href') || '').replace(/\/$/, '') || '/'
      if (href !== '/' && path.startsWith(href)) a.classList.add('on')
      else if (href === '/' && path === '/') a.classList.add('on')
    })

    /* ---------- mobile drawer ---------- */
    const burger = document.querySelector('.burger')
    const drawer = document.querySelector('.m-drawer')
    const ov = document.querySelector('.m-drawer-ov')
    const dx = document.querySelector('.m-drawer .dx')
    const openD = () => {
      ov?.classList.add('open')
      drawer?.classList.add('open')
      document.body.style.overflow = 'hidden'
    }
    const closeD = () => {
      ov?.classList.remove('open')
      drawer?.classList.remove('open')
      document.body.style.overflow = ''
    }
    burger?.addEventListener('click', openD)
    dx?.addEventListener('click', closeD)
    ov?.addEventListener('click', closeD)
    document.querySelectorAll('.m-drawer nav a').forEach((a) => a.addEventListener('click', closeD))
    cleanups.push(() => {
      burger?.removeEventListener('click', openD)
      dx?.removeEventListener('click', closeD)
      ov?.removeEventListener('click', closeD)
    })

    /* ---------- sticky-header shadow ---------- */
    const header = document.querySelector('.site-header')
    const onScroll = () => header?.classList.toggle('stuck', window.scrollY > 8)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    cleanups.push(() => window.removeEventListener('scroll', onScroll))

    /* ---------- year ---------- */
    document.querySelectorAll<HTMLElement>('[data-year]').forEach((n) => {
      n.textContent = String(new Date().getFullYear())
    })

    /* ---------- pricing cycle toggle ---------- */
    const seg = document.querySelector('[data-price-seg]')
    if (seg) {
      const onSeg = (e: Event) => {
        const b = (e.target as HTMLElement)?.closest('button[data-cycle]')
        if (!b) return
        const cycle = b.getAttribute('data-cycle')
        seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b))
        document.querySelectorAll<HTMLElement>('[data-mo]').forEach((n) => {
          n.textContent = n.getAttribute('data-' + cycle) || ''
        })
        document.querySelectorAll<HTMLElement>('[data-per-mo]').forEach((n) => {
          const lang = document.documentElement.getAttribute('lang') || 'en'
          n.innerHTML =
            n.getAttribute('data-per-' + cycle + '-' + lang) ||
            n.getAttribute('data-per-' + cycle) ||
            ''
        })
      }
      seg.addEventListener('click', onSeg)
      cleanups.push(() => seg.removeEventListener('click', onSeg))
    }

    /* ---------- FAQ accordion ---------- */
    const faqHandlers: Array<[Element, () => void]> = []
    document.querySelectorAll('.qa .q').forEach((q) => {
      const handler = () => {
        const qa = q.closest('.qa')
        const a = qa?.querySelector<HTMLElement>('.a')
        const open = qa?.classList.toggle('open')
        if (a) a.style.maxHeight = open ? a.scrollHeight + 'px' : '0'
      }
      q.addEventListener('click', handler)
      faqHandlers.push([q, handler])
    })
    cleanups.push(() => faqHandlers.forEach(([q, h]) => q.removeEventListener('click', h)))

    /* ---------- contact form success ---------- */
    const form = document.getElementById('lead-form') as HTMLFormElement | null
    if (form) {
      const onSubmit = (e: Event) => {
        e.preventDefault()
        if (!form.checkValidity()) {
          form.reportValidity()
          return
        }
        const ok = document.getElementById('form-ok')
        form.style.display = 'none'
        ok?.classList.add('show')
        window.scrollTo({
          top: form.getBoundingClientRect().top + window.scrollY - 120,
          behavior: 'smooth',
        })
      }
      form.addEventListener('submit', onSubmit)
      cleanups.push(() => form.removeEventListener('submit', onSubmit))
    }

    /* ---------- newsletter form (blog) ---------- */
    const news = document.querySelector<HTMLFormElement>('.apk-row form')
    if (news) {
      const onNews = (e: Event) => {
        e.preventDefault()
        news.reset()
        const btn = news.querySelector('button')
        if (btn)
          btn.textContent = document.documentElement.lang === 'fr' ? 'Inscrit ✓' : 'Subscribed ✓'
      }
      news.addEventListener('submit', onNews)
      cleanups.push(() => news.removeEventListener('submit', onNews))
    }

    /* ---------- reveal on scroll ---------- */
    const els = document.querySelectorAll('.reveal')
    if (!('IntersectionObserver' in window) || !els.length) {
      els.forEach((e) => e.classList.add('in'))
    } else {
      const io = new IntersectionObserver(
        (ents) => {
          ents.forEach((en) => {
            if (en.isIntersecting) {
              en.target.classList.add('in')
              io.unobserve(en.target)
            }
          })
        },
        { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
      )
      els.forEach((e) => io.observe(e))
      cleanups.push(() => io.disconnect())
    }

    return () => cleanups.forEach((fn) => fn())
  }, [])

  return null
}

<svelte:head>
  <title>Barktown</title>
  <meta name="description" content="Choose the Barktown diary or weekly report." />
</svelte:head>

<main class="intro">
  <section class="intro-card">
    <p class="eyebrow">🐕 Barktown</p>
    <h1>Welcome to Barktown</h1>
    <p class="lede">Choose a view to get started.</p>

    <nav aria-label="Barktown views">
      <a href="/diary">
        <strong>Diary</strong>
        <span>Browse the complete recording timeline.</span>
      </a>
      <a href="/report">
        <strong>Report</strong>
        <span>Review recordings two weeks at a time.</span>
      </a>
    </nav>
  </section>
</main>

<style>
  :global(*, *::before, *::after) { box-sizing: border-box; }
  :global(body) {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #f7f7f5;
    color: #1a1a1a;
  }

  .intro {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 2rem 1rem;
  }

  .intro-card {
    width: min(100%, 580px);
  }

  .eyebrow {
    margin: 0 0 0.75rem;
    font-weight: 700;
  }

  h1 {
    margin: 0;
    font-size: clamp(2rem, 8vw, 3.6rem);
    letter-spacing: -0.05em;
  }

  .lede {
    margin: 0.65rem 0 1.6rem;
    color: #777;
  }

  nav {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.8rem;
  }

  a {
    min-height: 124px;
    padding: 1.1rem;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 1rem;
    border: 1px solid #d8d8d3;
    border-radius: 10px;
    background: #fff;
    color: inherit;
    text-decoration: none;
    transition: transform 0.12s, border-color 0.12s, box-shadow 0.12s;
  }

  a:hover {
    transform: translateY(-2px);
    border-color: #999;
    box-shadow: 0 8px 24px rgb(0 0 0 / 7%);
  }

  a strong { font-size: 1.15rem; }
  a span { color: #777; font-size: 0.86rem; line-height: 1.4; }

  @media (max-width: 480px) {
    nav { grid-template-columns: 1fr; }
    a { min-height: 104px; }
  }
</style>

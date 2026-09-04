/* Real renderer and theme, synthetic match data only. Opt in with ?layoutchecks. */
if (new URLSearchParams(location.search).has('layoutchecks')) {
  window.addEventListener('load', async () => {
    const output = document.getElementById('harness-result');
    const checks = {};
    const original = JSON.parse(JSON.stringify(matches));
    const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
    const separated = () => {
      const board = document.querySelector('.score-board').getBoundingClientRect();
      const header = document.querySelector('.goal-team .team-header').getBoundingClientRect();
      return board.bottom + 8 <= header.top;
    };
    try {
      await document.fonts.ready;
      for (const count of [2, 3]) {
        matches = JSON.parse(JSON.stringify(original));
        if (count === 3) matches[0].teams.push({name:'C',players:[{id:'p-third',name:'Jugador Tercer Equipo'}]});
        matches[0].teams.forEach(team => { matches[0].result.goals[team.players[0].id] = 123; });
        renderGoles();
        await frame();
        checks[`teams${count}Separated`] = separated();
        checks[`teams${count}NoHorizontalOverflow`] = document.documentElement.scrollWidth <= innerWidth;
        checks[`teams${count}LabelsFit`] = [...document.querySelectorAll('.score-side .sname')].every(el => el.scrollWidth <= el.clientWidth);
        checks[`teams${count}NumbersFit`] = [...document.querySelectorAll('.score-side .snum')].every(el => el.scrollWidth <= el.clientWidth);
        window.scrollTo(0, 180);
        await frame();
        checks[`teams${count}ScrolledSeparated`] = separated();
        window.scrollTo(0, 0);
      }
      const board = document.querySelector('.score-board');
      board.style.top = '112px';
      checks.detectsOriginalOverlap = !separated();
      board.style.removeProperty('top');
      matches = original;
      renderGoles();
      output.dataset.checks = JSON.stringify(checks);
      const failed = Object.keys(checks).filter(key => !checks[key]);
      output.textContent = failed.length ? `FAIL LAYOUT: ${failed.join(', ')}` : 'PASS LAYOUT';
    } catch (error) {
      output.textContent = `FAIL LAYOUT: ${error.message}`;
    }
  });
}

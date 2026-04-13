async page => {
  const before = await page.evaluate(() => {
    const editor = document.querySelector("[role='textbox']");
    const emojiCount = Array.from(document.querySelectorAll("span")).filter(n =>
      (n.getAttribute("style") || "").includes("1f4f7.svg")
    ).length;
    const bodyImgs = editor ? editor.querySelectorAll("img").length : -1;
    return { emojiCount, bodyImgs };
  });

  const selected = await page.evaluate(() => {
    const editor = document.querySelector("[role='textbox']");
    if (!editor) return false;
    const el = Array.from(editor.querySelectorAll("span")).find(n =>
      (n.getAttribute("style") || "").includes("1f4f7.svg")
    );
    if (!el) return false;
    el.scrollIntoView({ block: "center" });
    editor.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNode(el);
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  });

  if (!selected) return { ok: false, reason: "no_placeholder", before };

  await page.waitForTimeout(600);
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(800);
  await page.keyboard.press("Control+V");
  await page.waitForTimeout(9000);

  const after = await page.evaluate(() => {
    const editor = document.querySelector("[role='textbox']");
    const emojiCount = Array.from(document.querySelectorAll("span")).filter(n =>
      (n.getAttribute("style") || "").includes("1f4f7.svg")
    ).length;
    const bodyImgs = editor ? editor.querySelectorAll("img").length : -1;
    return { emojiCount, bodyImgs };
  });

  return {
    ok: after.emojiCount === before.emojiCount - 1 && after.bodyImgs === before.bodyImgs + 1,
    before,
    after,
  };
}

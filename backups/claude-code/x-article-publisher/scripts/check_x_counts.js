async page => {
  return await page.evaluate(() => {
    const editor = document.querySelector("[role='textbox']");
    const emojiCount = Array.from(document.querySelectorAll("span")).filter(n =>
      (n.getAttribute("style") || "").includes("1f4f7.svg")
    ).length;
    const bodyImgs = editor ? editor.querySelectorAll("img").length : -1;
    const text = editor ? editor.innerText || "" : "";
    return {
      hasEditor: !!editor,
      emojiCount,
      bodyImgs,
      hasLiteralTag: /<h\\d|<p|<img|<style/i.test(text.slice(0, 2000)),
    };
  });
}

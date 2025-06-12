console.log("Content script loaded and running.");

function debounce(func, wait) {
  let timeout;
  return function(...args) {
    const context = this; 
    clearTimeout(timeout); 
    timeout = setTimeout(() => func.apply(context, args), wait); 
  };
}

function displayCorrection(sentenceElement, text, corrections) {
  if (!Array.isArray(corrections)) { 
    console.error('Expected corrections to be an array, received:', corrections);
    return;
  }

  console.log('Corrections:', corrections);
  corrections.sort((a, b) => a.offset - b.offset); 
  corrections.forEach(correction => {
    const { offset, length } = correction;
    console.log('Processing error at offset:', offset, 'with length:', length);

    let currentLength = 0;
    let done = false;

    function processNode(node) {
      if (done) return; 
      if (node.nodeType === Node.TEXT_NODE) { 
        const nodeLength = node.textContent.length;
        if (currentLength + nodeLength > offset && !done) {
          const positionInNode = offset - currentLength; 
          const range = document.createRange(); 
          range.setStart(node, positionInNode);
          range.setEnd(node, positionInNode);

          const dotSpan = document.createElement('span'); 
          dotSpan.textContent = ',';
          dotSpan.style.color = '#fcfcfc'; 
          range.insertNode(dotSpan); 

          done = true; 
          return;
        }
        currentLength += nodeLength; 
      } else if (node.hasChildNodes()) {
        Array.from(node.childNodes).forEach(processNode); 
      }
    }

    processNode(sentenceElement); 
    if (!done) {
      console.log('Error: Position for error not found in text nodes.'); 
    }
  });
}

function checkAndDisplayCorrections(sentenceElement) {
  const text = sentenceElement.innerText; 
  fetch(`https://api.languagetool.org/v2/check?language=fr&text=${encodeURIComponent(text)}`, {
    method: 'POST' 
  })
  .then(response => response.json())
  .then(data => {
    console.log('API Response:', data); 
    if (data.matches && Array.isArray(data.matches) && data.matches.length > 0) {
      displayCorrection(sentenceElement, text, data.matches); 
    } else {
      console.log('No errors found or API response issue'); 
    }
  })
  .catch(error => {
    console.error('Error:', error); 
  });
}

const debouncedCheckAndDisplayCorrections = debounce(checkAndDisplayCorrections, 500);

function initMutationObserver() {
  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.classList.contains('sentence')) { 
            debouncedCheckAndDisplayCorrections(node);
          }
          node.querySelectorAll('.sentence').forEach(sentenceElement => {
            debouncedCheckAndDisplayCorrections(sentenceElement); 
          });
        }
      });
    });
  });

  observer.observe(document.body, { childList: true, subtree: true }); 
}

initMutationObserver(); 

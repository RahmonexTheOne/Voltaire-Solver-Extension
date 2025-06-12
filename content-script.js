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
          dotSpan.style.color = '#fefefe'; // Even whiter
          dotSpan.style.fontSize = '0.8em'; // Smaller font size
          dotSpan.style.opacity = '0.2';
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
  const text = sentenceElement.innerText.trim();
  
  // Skip very short texts
  if (text.length < 3) return;
  
  // Try LanguageTool with better parameters
  const languageToolUrl = `https://api.languagetool.org/v2/check`;
  const params = new URLSearchParams({
    language: 'fr',
    text: text,
    enabledOnly: 'false',
    level: 'picky' // More thorough checking
  });

  fetch(languageToolUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params
  })
  .then(response => response.json())
  .then(data => {
    console.log('API Response:', data);
    console.log('Text being checked:', text);
    
    if (data.matches && Array.isArray(data.matches) && data.matches.length > 0) {
      // Filter out very minor suggestions to reduce false positives
      const significantMatches = data.matches.filter(match => 
        match.rule && 
        (match.rule.category.id === 'GRAMMAR' || 
         match.rule.category.id === 'TYPOS' ||
         match.rule.category.id === 'CONFUSED_WORDS')
      );
      
      if (significantMatches.length > 0) {
        displayCorrection(sentenceElement, text, significantMatches);
      }
    } else {
      console.log('No errors found');
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

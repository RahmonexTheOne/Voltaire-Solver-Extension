browser.browserAction.onClicked.addListener(function(tab) {
    browser.tabs.executeScript(tab.id, {file: "content-script.js"});
});

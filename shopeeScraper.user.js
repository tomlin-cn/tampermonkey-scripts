// ==UserScript==
// @name         Shopee BigSeller Scraper - 智能延迟与重试版
// @namespace    http://tampermonkey.net/
// @version      2026.2.27
// @updateURL    https://raw.githubusercontent.com/tomlin-cn/tampermonkey-scripts/main/shopeeScraper.user.js
// @downloadURL  https://raw.githubusercontent.com/tomlin-cn/tampermonkey-scripts/main/shopeeScraper.user.js
// @description  Shopee 搜索页单页采集（延迟滚动+采集失败自动重试+支持RB销量）
// @author       ChatGPT
// @match        https://shopee.co.id/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const LOCAL_STORAGE_KEY = 'shopee_bigseller_collected_urls';
    const MIN_SALES = 100;
    const CLICK_DELAY = 800;
    const INITIAL_DELAY = 10000;  // 🕒 打开网址后延迟30秒再滚动检测
    const LOGIN_DELAY = 30000;
    const SCROLL_STEP = 2000;
    const SCROLL_DELAY = 800;
    const STABLE_COUNT_CHECKS = 5;
    const MAX_RETRY = 3; // 检测不到采集按钮最多重试3次

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    function loadCollectedUrls() {
        try {
            const data = localStorage.getItem(LOCAL_STORAGE_KEY);
            return data ? new Set(JSON.parse(data)) : new Set();
        } catch {
            localStorage.removeItem(LOCAL_STORAGE_KEY);
            return new Set();
        }
    }

    function saveCollectedUrls(urls) {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([...urls]));
    }

    function getProductCards() {
        return document.querySelectorAll('li.shopee-search-item-result__item');
    }

    function getProductUrl(card) {
        const a = card.querySelector('a.bigSellerLink');
        return a ? a.href.split('?')[0] : null;
    }

    async function clickLoginLinkIfExists() {
        const loginLink = document.querySelector('a.navbar__link[href*="/buyer/login"]');
        if (!loginLink) return false;
        loginLink.click();
        console.log('⚠️ 点击登录链接跳转登录页面');
        return true;
    }

    async function forceClickLoginButton() {
        const loginBtn = document.querySelector('button.b5aVaf.PVSuiZ.Gqupku.qz7ctP.qxS7lQ.Q4KP5g[elementtiming="shopee:heroComponentPaint"]');
        if (!loginBtn) return false;

        loginBtn.style.pointerEvents = 'auto';
        loginBtn.style.opacity = '1';
        ['mouseover','mousemove','mousedown','mouseup','click'].forEach(eventType => {
            loginBtn.dispatchEvent(new MouseEvent(eventType, { bubbles:true, cancelable:true }));
        });

        loginBtn.click();
        await sleep(1000);
        loginBtn.click();
        console.log('⚠️ 首页灰色登录按钮已点击');
        return true;
    }

    async function scrollAndLoadAll() {
        let lastCount = 0;
        let stableCount = 0;
        while (stableCount < STABLE_COUNT_CHECKS) {
            window.scrollBy(0, SCROLL_STEP);
            await sleep(SCROLL_DELAY);
            const currentCount = getProductCards().length;
            if (currentCount === lastCount) stableCount++;
            else { stableCount = 0; lastCount = currentCount; }
        }
        console.log(`🟢 页面商品总数: ${lastCount}`);
    }

    function findProductsToScrape(collectedUrls) {
        const cards = getProductCards();
        const results = [];

        cards.forEach((card, index) => {
            const titleEl = card.querySelector('.line-clamp-2');
            const btn = card.querySelector('.crawl_trigger.scrape');
            const salesEl = card.querySelector('div.truncate.text-shopee-black87');
            const url = getProductUrl(card);
            if (!url || !titleEl) return;

            const title = titleEl.innerText.trim();
            const salesText = salesEl ? salesEl.innerText.trim().toUpperCase() : '';

            // 🔥 支持 "1RB", "2.3RB" 这类销量格式
            let sales = 0;
            const rbMatch = salesText.match(/([\d.]+)\s*RB/);
            if (rbMatch) {
                sales = parseFloat(rbMatch[1]) * 1000;
            } else {
                sales = parseInt(salesText.replace(/[^\d]/g, '') || '0');
            }

            const reason = [];
            if (collectedUrls.has(url)) reason.push('已采集');
            if (!btn) reason.push('无按钮');
            if (sales < MIN_SALES) reason.push('销量不足');

            const canCollect = reason.length === 0;
            console.log(`${index + 1}. "${title}" | 销量: ${sales} | URL: ${url} | 可采集: ${canCollect} ${canCollect ? '' : '| 原因: ' + reason.join(', ')}`);

            if (canCollect) results.push({ btn, url, title, sales });
        });

        return results;
    }

    async function scrapeOnce() {
        const collectedUrls = loadCollectedUrls();
        console.log("🟢 开始采集，已记录数:", collectedUrls.size);

        let products = findProductsToScrape(collectedUrls);
        let retry = 0;
        let waitTime = 30000; // 初始等待30秒

        while (products.length === 0 && retry < MAX_RETRY) {
            retry++;
            console.log(`⚠️ 未找到可采集商品，${waitTime/1000}s 后重试 (${retry}/${MAX_RETRY})...`);
            await sleep(waitTime);

            // 第二次及之后刷新页面
            if (retry > 1) {
                console.log('🔄 刷新页面后重试采集...');
                location.reload();
                return; // 刷新后脚本会重新加载执行
            }

            products = findProductsToScrape(collectedUrls);
            waitTime += 30000; // 每次延迟+30秒
        }

        if (products.length === 0) {
            console.log("❌ 连续3次未找到采集按钮，终止本页采集");
            return;
        }

        for (const { btn, url } of products) {
            if (btn) {
                btn.style.display = 'block';
                btn.dispatchEvent(new MouseEvent('click', { bubbles:true, cancelable:true }));
            }
            collectedUrls.add(url);
            saveCollectedUrls(collectedUrls);
            await sleep(CLICK_DELAY);
        }

        console.log("✅ 单页采集完成");
    }

    async function main() {
        await sleep(INITIAL_DELAY); // ✅ 打开后延迟30秒再开始滚动检测

        let clicked = await clickLoginLinkIfExists();
        if (!clicked) clicked = await forceClickLoginButton();
        if (clicked) await sleep(LOGIN_DELAY);

        await scrollAndLoadAll();
        await scrapeOnce();
    }

    window.addEventListener('load', main);
})();

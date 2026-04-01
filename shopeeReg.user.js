// ==UserScript==
// @name         Shopee印尼注册自动接码助手(Hero-SMS版)
// @namespace    http://tampermonkey.net/
// @version      3.5
// @description  对接 hero-sms.com 平台，保留原有邮件OTP逻辑及页面监控
// @author       You
// @match        https://shopee.co.id/buyer/signup*
// @match        https://shopee.co.id/?is_from_signup=true*
// @match        https://shopee.co.id/user/account/email*
// @match        https://console.bitbrowser.net/*
// @match        https://shopee.co.id/user/account/profile*
// @connect      hero-sms.com
// @connect      bsh.bhdata.com
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_setClipboard
// ==/UserScript==

(function() {
    'use strict';

    // ================= 配置区域 (已更新为 Hero-SMS) =================
    const CONFIG = {
        apiKey: "30251114dB174c607c89c21e69B2952d",
        serviceId: "ka", // 服务名称
        countryId: "6",      // 国家ID
        baseUrl: "https://hero-sms.com/stubs/handler_api.php",
        emailOtpUrl: "https://bsh.bhdata.com:30015/e7g1Ysq/",
        maxResend: 4,
        pollInterval: 3000,
        waitTimeout: 60000
    };

    let state = { phone: "", requestId: "", resendCount: 0, timer: null, startTime: 0, emailAttemptCount: 0 };

    // ================= 路由分发 =================
    const currentUrl = window.location.href;
    if (currentUrl.includes("console.bitbrowser.net")) runBitBrowserExtractor();
    else if (currentUrl.includes("shopee.co.id/buyer/signup")) createUI();
    else if (currentUrl.includes("is_from_signup=true")) window.location.href = "https://shopee.co.id/user/account/email";
    else if (currentUrl.includes("shopee.co.id/user/account/email")) { createUI(); runAutoFillEmail(); startEmailOtpMonitor(); }
    else if (currentUrl.includes("shopee.co.id/user/account/profile")) { createUI(); }

    // ================= 1. 修正后的邮箱提取 =================
    function runBitBrowserExtractor() {
        const scanTimer = setInterval(() => {
            document.querySelectorAll('.row-left .bd').forEach(div => {
                if (div.innerText.includes("名称")) {
                    const hdDiv = div.nextElementSibling;
                    if (hdDiv && hdDiv.innerText.includes("@")) {
                        const emailRegex = /[a-zA-Z0-9][a-zA-Z0-9._%+-]*@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
                        const emailMatch = hdDiv.innerText.match(emailRegex);
                        if (emailMatch) {
                            GM_setValue("saved_shopee_email", emailMatch[0].trim());
                            div.style.backgroundColor = "#ccffcc";
                            clearInterval(scanTimer);
                        }
                    }
                }
            });
        }, 2000);
    }

    // ================= 2. 邮件OTP定向修改 =================
    function startEmailOtpMonitor() {
        const monitorTimer = setInterval(() => {
            const notice = document.querySelector('div.Z5RLqi');
            if (notice && notice.innerText.includes("e-mail")) {
                clearInterval(monitorTimer);
                const email = GM_getValue("saved_shopee_email");
                log(`📩 邮件码流程：等待 10s 后开始查码...`);

                state.emailAttemptCount = 0;
                setTimeout(() => {
                    log("🔎 开始执行邮件码接收...");
                    state.emailTimer = setInterval(() => {
                        state.emailAttemptCount++;
                        log(`邮件查码第 ${state.emailAttemptCount} 次...`);

                        GM_xmlhttpRequest({
                            method: "GET",
                            url: CONFIG.emailOtpUrl + email,
                            onload: function(response) {
                                try {
                                    const res = JSON.parse(response.responseText);
                                    if (res.code === 0 && res.data && res.data.result) {
                                        const code = (res.data.result.match(/(?<!\d)\d{6}(?!\d)/) || [])[0];
                                        if (code) {
                                            log(`✅ 邮件码: ${code}`);
                                            clearInterval(state.emailTimer);
                                            fillOTP(code);
                                            return;
                                        }
                                    }
                                } catch (e) {}
                                if (state.emailAttemptCount >= 2) {
                                    clearInterval(state.emailTimer);
                                    log("❌ 邮件码已请求2次无果，请【人工介入】");
                                }
                            }
                        });
                    }, 5000);
                }, 10000);
            }
        }, 2000);
    }

    // ================= 3. 查码监控强化 =================
    function waitForOTPInput() {
        log("🔄 开启查码页面监控...");
        const checkItv = setInterval(() => {
            const otpLabel = document.querySelector('div._EqsPO') || xpath("//div[contains(text(),'Masukkan Kode OTP')]");
            if (otpLabel) {
                clearInterval(checkItv);
                log("🚀 [检测成功] 已进入接码页，启动 Hero-SMS 查码定时器...");
                state.startTime = Date.now();
                if (state.timer) clearInterval(state.timer);
                state.timer = setInterval(checkSMS, CONFIG.pollInterval);
            }
        }, 1000);
    }

    // ================= 4. Hero-SMS 对接逻辑更新 =================

    function createUI() {
        if(document.getElementById('btn_start')) return;
        if (!state.phone) {
            state.phone = GM_getValue("last_fetched_phone", "");
        }
        const div = document.createElement('div');
        div.style = "position: fixed; top: 10px; right: 10px; background: #fff; border: 2px solid #ee4d2d; z-index: 999999; padding: 15px; border-radius: 8px; font-family: sans-serif; width: 220px; box-shadow: 0 4px 10px rgba(0,0,0,0.2);";
        div.innerHTML = `
            <h3 style="margin:0 0 10px 0; color:#ee4d2d; font-size:16px; font-weight:bold;">Shopee助手</h3>
            <div id="msg_log" style="font-size:12px; color:#333; margin-bottom:10px; height:100px; overflow-y:auto; border:1px solid #eee; padding:5px; background:#f9f9f9;">准备就绪...</div>
            <button id="btn_start" style="width:100%; padding: 8px; background:#ee4d2d; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold; margin-bottom:8px;">开始注册 (Hero取号)</button>
            <button id="btn_copy" style="width:100%; padding: 6px; background:#555; color:white; border:none; border-radius:4px; cursor:pointer; font-size:12px;">一键复制号码</button>
        `;
        document.body.appendChild(div);
        document.getElementById('btn_start').onclick = startProcess;
        document.getElementById('btn_copy').onclick = () => { if(state.phone) { GM_setClipboard(state.phone); log("📋 已复制"); } };
    }

    // 修改：取号逻辑 (Hero-SMS)
    function startProcess() {
        log("正在向 Hero-SMS 请求号码...");
        GM_xmlhttpRequest({
            method: "GET",
            url: `${CONFIG.baseUrl}?action=getNumberV2&service=${CONFIG.serviceId}&country=${CONFIG.countryId}&api_key=${CONFIG.apiKey}`,
            onload: function(response) {
                try {
                    const res = JSON.parse(response.responseText);
                    // Hero-SMS 返回字段为 phoneNumber 和 activationId
                    const gotPhone = res.phoneNumber;
                    const gotId = res.activationId;

                    if (gotPhone && gotId) {
                        state.phone = gotPhone;
                        state.requestId = gotId;
                        GM_setValue("last_fetched_phone", gotPhone);
                        log(`✅ 解析成功: ${state.phone}`);
                        document.getElementById('btn_copy').innerText = "复制: " + state.phone;
                        fillPhoneAndSubmit();
                    } else {
                        log("❌ 取号失败: " + (res.message || "无可用号码"));
                    }
                } catch (e) {
                    log("❌ 接口响应解析异常");
                }
            }
        });
    }

    // 修改：查码逻辑 (Hero-SMS)
    function checkSMS() {
        if (Date.now() - state.startTime > CONFIG.waitTimeout) { handleResend(); return; }
        GM_xmlhttpRequest({
            method: "GET",
            url: `${CONFIG.baseUrl}?action=getStatusV2&id=${state.requestId}&api_key=${CONFIG.apiKey}`,
            onload: function(response) {
                try {
                    const res = JSON.parse(response.responseText);
                    // 尝试从 JSON 任意位置正则提取 6 位数字
                    let code = (JSON.stringify(res).match(/(?<!\d)\d{6}(?!\d)/) || [])[0];
                    
                    if (code) {
                        log(`✅ 验证码: ${code}`);
                        clearInterval(state.timer);
                        setTimeout(() => fillOTP(code), 500);
                    } else {
                        // 如果没有验证码，通常返回的是状态信息，可在控制台查看日志
                        // log(`等待中... ${res.status || ""}`);
                    }
                } catch (e) {}
            }
        });
    }

    // ================= 以下为原有的辅助函数，保持不变 =================

    function fillPhoneAndSubmit() {
        const input = document.querySelector('input[name="phone"]');
        if (!input) return;
        fillReactInput(input, state.phone);
        let itv = setInterval(() => {
            const allBtns = document.querySelectorAll('button');
            for (let btn of allBtns) {
                if (btn.innerText.toUpperCase().includes("BERIKUTNYA") && !btn.disabled) {
                    clearInterval(itv); btn.click(); findAgreeButton(); break;
                }
            }
        }, 500);
    }

    function findAgreeButton() {
        let itv = setInterval(() => {
            const btn = xpath("//button[contains(., 'Setuju')]");
            if (btn) { clearInterval(itv); btn.click(); waitForCaptchaSuccess(); }
        }, 500);
    }

    function waitForCaptchaSuccess() {
        const itv = setInterval(() => {
            const methodBtn = xpath("//button[contains(text(),'Metode Lain')]");
            if (methodBtn && methodBtn.offsetParent !== null) {
                clearInterval(itv);
                setTimeout(() => { methodBtn.click(); switchToSMS(); }, 2000);
            }
        }, 1000);
    }

    function switchToSMS() {
        setTimeout(() => {
            const smsBtn = xpath("//button[contains(., 'SMS')]");
            if (smsBtn) { smsBtn.click(); waitForOTPInput(); }
        }, 1000);
    }

    function handleResend() {
        const btn = xpath("//button[contains(text(),'Kirim Ulang')]");
        if (btn && !btn.disabled) { btn.click(); state.startTime = Date.now(); }
    }

    function fillOTP(code) {
        const input = document.querySelector('input.w_Qhj0') || document.querySelector('input[autocomplete="one-time-code"]');
        if (input) {
            fillReactInput(input, code);
            setTimeout(() => {
                const btn = xpath("//button[contains(., 'Lanjut')]") || document.querySelector('button.qz7ctP');
                if (btn) {
                    btn.click();
                    if (window.location.href.includes("signup")) waitForPasswordAndSubmit();
                }
            }, 800);
        }
    }

    function waitForPasswordAndSubmit() {
        const itv = setInterval(() => {
            const input = document.querySelector('input[name="password"]');
            if (input) {
                clearInterval(itv);
                fillReactInput(input, "Aa112211.");
                setTimeout(() => {
                    const btn = xpath("//button[contains(., 'Daftar')]");
                    if (btn) btn.click();
                }, 2000);
            }
        }, 500);
    }

    function runAutoFillEmail() {
        const email = GM_getValue("saved_shopee_email");
        if (!email) return;
        const itv = setInterval(() => {
            const input = document.querySelector('input[name="email"]');
            if (input && !document.querySelector('div.Z5RLqi')) {
                clearInterval(itv); fillReactInput(input, email);
                setTimeout(() => {
                    const btn = xpath("//button[contains(., 'Selanjutnya')]") || document.querySelector('button.btn-solid-primary');
                    if (btn) btn.click();
                }, 2000);
            }
        }, 1000);
    }

    function fillReactInput(inputEl, value) {
        let lastValue = inputEl.value;
        inputEl.value = value;
        let event = new Event('input', { bubbles: true });
        event.simulated = true;
        let tracker = inputEl._valueTracker;
        if (tracker) tracker.setValue(lastValue);
        inputEl.dispatchEvent(event);
        try {
            let nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
            nativeSetter.call(inputEl, value);
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        } catch(e) {}
    }

    function xpath(query) { return document.evaluate(query, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue; }

    function log(msg) {
        const el = document.getElementById('msg_log');
        if (el) { el.innerHTML = `[${new Date().toLocaleTimeString()}] ${msg}<br>` + el.innerHTML; }
    }

})();

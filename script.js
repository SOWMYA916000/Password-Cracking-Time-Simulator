
"use strict";

const passwordInput = document.getElementById("password");
const speedInput = document.getElementById("speed");
const modeInput = document.getElementById("mode");

let speedChart = null;
let debounceTimer = null;

const YEAR_SECONDS = 365.25 * 24 * 60 * 60;

// Detect character categories from the sample password.
// This is a simple model based on printable ASCII characters.
function analyzeCharacters(password) {
    const lower = /[a-z]/.test(password);
    const upper = /[A-Z]/.test(password);
    const digits = /[0-9]/.test(password);
    const symbols = /[^a-zA-Z0-9]/.test(password);

    let pool = 0;

    if (lower) pool += 26;
    if (upper) pool += 26;
    if (digits) pool += 10;
    if (symbols) pool += 32;

    return {
        length: [...password].length,
        lower,
        upper,
        digits,
        symbols,
        pool
    };
}

// Calculate logarithms instead of directly calculating pool^length.
// This safely handles extremely large theoretical search spaces.
function getEstimate(length, pool, speed, mode) {
    const log10Combinations = length * Math.log10(pool);

    // Average search checks half the combinations; worst case checks all.
    const log10Guesses =
        log10Combinations + (mode === "average" ? Math.log10(0.5) : 0);

    const log10Seconds = log10Guesses - Math.log10(speed);

    return { log10Combinations, log10Seconds };
}

function formatCombinations(logValue) {
    if (logValue < 15) {
        return Math.round(10 ** logValue).toLocaleString("en-US");
    }

    return "10^" + logValue.toFixed(2);
}

function formatTime(logSeconds) {
    if (!Number.isFinite(logSeconds)) return "Unavailable";

    if (logSeconds < 0) {
        return (10 ** logSeconds).toPrecision(3) + " seconds";
    }

    const units = [
        ["years", YEAR_SECONDS],
        ["days", 86400],
        ["hours", 3600],
        ["minutes", 60],
        ["seconds", 1]
    ];

    for (const [name, unitSeconds] of units) {
        const logUnit = Math.log10(unitSeconds);

        if (logSeconds >= logUnit) {
            const logValue = logSeconds - logUnit;

            if (logValue > 12) {
                return "10^" + logValue.toFixed(2) + " " + name;
            }

            return (10 ** logValue).toLocaleString("en-US", {
                maximumSignificantDigits: 4
            }) + " " + name;
        }
    }

    return "Less than one second";
}

function setText(id, value) {
    document.getElementById(id).textContent = value;
}

function clearResults() {
    [
        "estimatedTime", "combinations", "entropy",
        "length", "lower", "upper", "digits", "symbols", "pool"
    ].forEach(id => setText(id, "—"));

    setText("estimateLabel", "Enter a sample password");
    setText("insightTitle", "Security insight");
    setText("insightText", "Enter a sample password to view the analysis.");

    if (speedChart) {
        speedChart.destroy();
        speedChart = null;
    }

    document.getElementById("chartFallback").hidden = true;
}

function updateChart(length, pool, selectedSpeed, mode) {
    const canvas = document.getElementById("speedChart");
    const fallback = document.getElementById("chartFallback");

    if (typeof Chart === "undefined") {
        fallback.hidden = false;
        return;
    }

    fallback.hidden = true;

    const speeds = [
        { label: "1,000 / sec", value: 1000 },
        { label: "1 million / sec", value: 1e6 },
        { label: "1 billion / sec", value: 1e9 }
    ];

    const labels = speeds.map(item => item.label);
    const values = speeds.map(item =>
        getEstimate(length, pool, item.value, mode).log10Seconds
    );

    if (speedChart) speedChart.destroy();

    speedChart = new Chart(canvas, {
        type: "bar",
        data: {
            labels,
            datasets: [{
                label: "Log10 of estimated seconds",
                data: values,
                backgroundColor: speeds.map(item =>
                    item.value === selectedSpeed ? "#55d6d0" : "#638cff"
                ),
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: "#c0cee3" }
                },
                tooltip: {
                    callbacks: {
                        label: context =>
                            "Log10(seconds): " + context.raw.toFixed(2)
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: "#a5b4cc" },
                    grid: { color: "#23314a" }
                },
                y: {
                    title: {
                        display: true,
                        text: "Log10(seconds)",
                        color: "#a5b4cc"
                    },
                    ticks: { color: "#a5b4cc" },
                    grid: { color: "#23314a" }
                }
            }
        }
    });
}

function analyzePassword() {
    const password = passwordInput.value;

    if (password.length === 0) {
        clearResults();
        setText("insightText", "Enter a sample password to begin.");
        return;
    }

    const details = analyzeCharacters(password);
    const speed = Number(speedInput.value);
    const mode = modeInput.value;

    const estimate = getEstimate(
        details.length, details.pool, speed, mode
    );

    const entropy = details.length * Math.log2(details.pool);

    setText("length", details.length + " characters");
    setText("lower", details.lower ? "Present" : "Absent");
    setText("upper", details.upper ? "Present" : "Absent");
    setText("digits", details.digits ? "Present" : "Absent");
    setText("symbols", details.symbols ? "Present" : "Absent");
    setText("pool", details.pool + " possible characters");

    setText("combinations",
        formatCombinations(estimate.log10Combinations));

    setText("entropy", entropy.toFixed(2) + " bits");
    setText("estimatedTime", formatTime(estimate.log10Seconds));

    setText(
        "estimateLabel",
        mode === "average"
            ? "Average exhaustive search · " + speed.toLocaleString() +
              " guesses/sec"
            : "Worst-case exhaustive search · " +
              speed.toLocaleString() + " guesses/sec"
    );

    if (details.length < 8) {
        setText("insightTitle", "Consider a longer password");
        setText(
            "insightText",
            "Short passwords often have smaller search spaces. " +
            "Use a long, unique password generated randomly when possible."
        );
    } else {
        setText("insightTitle", "Understand the model's limits");
        setText(
            "insightText",
            "The estimate assumes every character is independently and " +
            "uniformly selected from a pool of " + details.pool +
            " characters. Repeated patterns or common words can make a " +
            "real password much easier to guess than this estimate suggests."
        );
    }

    updateChart(details.length, details.pool, speed, mode);
}

// Analyze as the user types, with a short delay.
passwordInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(analyzePassword, 150);
});

speedInput.addEventListener("change", analyzePassword);
modeInput.addEventListener("change", analyzePassword);

document.getElementById("analyzeBtn")
    .addEventListener("click", analyzePassword);

document.getElementById("toggleBtn").addEventListener("click", () => {
    const showing = passwordInput.type === "text";
    passwordInput.type = showing ? "password" : "text";
    document.getElementById("toggleBtn").textContent =
        showing ? "Show" : "Hide";
});

document.getElementById("clearBtn").addEventListener("click", () => {
    clearTimeout(debounceTimer);
    passwordInput.value = "";
    passwordInput.type = "password";
    document.getElementById("toggleBtn").textContent = "Show";
    clearResults();
    passwordInput.focus();
});

// Show an empty state until a sample password is entered.
clearResults();

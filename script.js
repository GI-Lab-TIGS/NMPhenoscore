let symptoms = [];
const commonSymptoms = [
    'Pyloric atresia', 'Retinopathy', 'Rippling muscles', 'Hyperreflexia', 'Polyhill sign', 'Hypogonadism ', 'Muscle weakness', 'Progressive muscle degeneration', 'Elevated creatinine phosphokinase',
    'Scoliosis', 'Joint contractures', 'Cardiac abnormalities', 'Respiratory failure', 'Developmental delay'
];

let symptomConditionDf = null;
let allSymptoms = [];
let symptomMapping = {};
let conditionUrls = {};  

// Function to compute LCS length
function lcsLength(s1, s2) {
    const m = s1.length;
    const n = s2.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (s1[i - 1] === s2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    return dp[m][n];
}

// SequenceMatcher-like ratio
function sequenceMatcherRatio(s1, s2) {
    s1 = s1.toLowerCase();
    s2 = s2.toLowerCase();
    if (s1.length === 0 && s2.length === 0) return 1.0;
    if (s1.length === 0 || s2.length === 0) return 0.0;

    const lcs = lcsLength(s1, s2);
    return 2.0 * lcs / (s1.length + s2.length);
}

// Extract symptom name
function extractSymptomName(fullSymptomText) {
    if (fullSymptomText.includes('(') && fullSymptomText.includes(')')) {
        return fullSymptomText.split('(')[0].trim();
    }
    return fullSymptomText.trim();
}

// Find closest matches
function findClosestMatches(inputSymptom, allSymptoms, threshold = 0.6) {
    const matches = [];
    for (const fullSymptom of allSymptoms) {
        const simpleSymptom = extractSymptomName(fullSymptom);
        const similarity = sequenceMatcherRatio(inputSymptom, simpleSymptom);
        if (similarity >= threshold) {
            matches.push({ full: fullSymptom, simple: simpleSymptom, similarity: Math.round(similarity * 100) / 100 });
        }
    }
    matches.sort((a, b) => b.similarity - a.similarity);
    return matches;
}

// Prioritize conditions
function prioritizeConditions(symptomsList, symptomConditionDf, symptomMapping) {
    const mappedSymptoms = symptomsList.map(s => symptomMapping[s.toLowerCase()] || s);

    const symptomIndices = mappedSymptoms.map(ms => symptomConditionDf.symptoms.indexOf(ms)).filter(idx => idx !== -1);
    if (symptomIndices.length === 0) return { scores: {}, matched: {} };

    const filteredData = symptomIndices.map(idx => symptomConditionDf.data[idx]);

    const conditionScores = {};
    symptomConditionDf.conditions.forEach((condition, colIdx) => {
        let score = 0;
        filteredData.forEach(row => score += row[colIdx] || 0);
        conditionScores[condition] = score;
    });

    const sortedScores = Object.entries(conditionScores)
        .filter(([, score]) => score > 0)
        .sort(([, a], [, b]) => b - a);

    const prioritizedConditions = {};
    for (const [condition, score] of sortedScores) {
        prioritizedConditions[condition] = score;
    }

    const matchedSymptomsDict = {};
    for (const condition of symptomConditionDf.conditions) {
        const matchedFull = [];
        const colIdx = symptomConditionDf.conditions.indexOf(condition);
        for (let rowIdx = 0; rowIdx < symptomIndices.length; rowIdx++) {
            const dataIdx = symptomIndices[rowIdx];
            if (symptomConditionDf.data[dataIdx][colIdx] === 1) {
                const fullSymptom = symptomConditionDf.symptoms[dataIdx];
                const simple = extractSymptomName(fullSymptom);
                matchedFull.push(simple);
            }
        }
        matchedSymptomsDict[condition] = matchedFull;
    }

    return { scores: prioritizedConditions, matched: matchedSymptomsDict };
}

// Load and preprocess data from JSON
async function loadData() {
    try {
        const response = await fetch('prevalence.json');
        if (!response.ok) throw new Error('Failed to fetch prevalence.json');
        const json = await response.json();

        symptomConditionDf = json;
        allSymptoms = json.symptoms;
        symptomMapping = {};
        for (const full of allSymptoms) {
            const simple = extractSymptomName(full);
            const key = simple.toLowerCase();
            if (!symptomMapping.hasOwnProperty(key)) symptomMapping[key] = full;
        }

        const urlResponse = await fetch('conditions_gene_data.json');
        if (urlResponse.ok) conditionUrls = await urlResponse.json();
        else console.warn('condition_urls.json not found or failed to load');

        console.log('Data loaded successfully');
        return true;
    } catch (e) {
        console.error(`Error loading file: ${e}`);
        return false;
    }
}

// Fetch all possible symptoms for autocomplete
async function fetchAllSymptoms() {
    if (!symptomConditionDf) { console.error('Data not loaded'); return; }
    const simpleSymptoms = allSymptoms.map(extractSymptomName);
    const uniqueSorted = [...new Set(simpleSymptoms)].sort();
    const datalist = document.getElementById('symptomSuggestions');
    uniqueSorted.forEach(sym => {
        const option = document.createElement('option');
        option.value = sym;
        datalist.appendChild(option);
    });
}

// DOM elements
const input = document.getElementById('symptomInput');
const addBtn = document.getElementById('addBtn');
const addedList = document.getElementById('addedSymptoms');
const analyzeBtn = document.getElementById('analyzeBtn');
const resultsDiv = document.getElementById('results');
const clearBtn = document.getElementById('clearSymptoms');

// Add symptom
addBtn.addEventListener('click', addSymptom);
input.addEventListener('keypress', (e) => { if (e.key === 'Enter') addSymptom(); });
function addSymptom() {
    const symptom = input.value.trim();
    if (symptom && !symptoms.includes(symptom)) {
        symptoms.push(symptom);
        updateAddedList();
        input.value = '';
        updateAnalyzeBtn();
        const newItem = addedList.lastChild;
        newItem.style.animation = 'fadeIn 0.5s';
    }
}

// Quick add common symptoms
document.querySelectorAll('.common-symptoms button').forEach(btn => {
    btn.addEventListener('click', () => {
        const symptom = btn.dataset.symptom;
        if (!symptoms.includes(symptom)) {
            symptoms.push(symptom);
            updateAddedList();
            updateAnalyzeBtn();
            btn.disabled = true;
            btn.style.opacity = '0.5';
        }
    });
});

function updateAddedList() {
    addedList.innerHTML = symptoms.map((symptom, index) => 
        `<div class="symptom-item">
            <span>${symptom}</span>
            <button type="button" onclick="removeSymptom(${index})"><i class="fas fa-times"></i></button>
        </div>`).join('');
    clearBtn.style.display = symptoms.length > 0 ? 'block' : 'none';
}

function removeSymptom(index) {
    const symptom = symptoms[index];
    symptoms.splice(index, 1);
    updateAddedList();
    updateAnalyzeBtn();
    document.querySelectorAll('.common-symptoms button').forEach(btn => {
        if (btn.dataset.symptom === symptom) { btn.disabled = false; btn.style.opacity = '1'; }
    });
}

// Clear all symptoms
clearBtn.addEventListener('click', () => {
    symptoms = [];
    updateAddedList();
    updateAnalyzeBtn();
    document.querySelectorAll('.common-symptoms button').forEach(btn => {
        btn.disabled = false; btn.style.opacity = '1';
    });
});

function updateAnalyzeBtn() { analyzeBtn.disabled = symptoms.length === 0; }

// Analyze button
analyzeBtn.addEventListener('click', async () => {
    if (!symptomConditionDf) {
        resultsDiv.innerHTML = `<div class="error"><p>Error: Data not loaded. Please refresh the page.</p></div>`;
        return;
    }

    analyzeBtn.disabled = true;
    analyzeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';
    resultsDiv.innerHTML = '<p><i class="fas fa-spinner fa-spin"></i> Analyzing symptoms...</p>';

    try {
        const valid_symptoms = [];
        const invalid_symptoms = [];
        const suggested_matches = {};

        for (const symptom of symptoms) {
            const originalSimple = extractSymptomName(symptom);
            const lowerSimple = originalSimple.toLowerCase();
            if (symptomMapping.hasOwnProperty(lowerSimple)) valid_symptoms.push(originalSimple);
            else {
                invalid_symptoms.push(symptom);
                const closeMatches = findClosestMatches(symptom, allSymptoms);
                if (closeMatches.length > 0) suggested_matches[symptom] = closeMatches.slice(0, 3);
            }
        }

        let prioritized_conditions = {};
        let matched_symptoms = {};
        let top_condition = "";

        if (valid_symptoms.length > 0) {
            const { scores, matched } = prioritizeConditions(valid_symptoms, symptomConditionDf, symptomMapping);
            prioritized_conditions = scores;
            matched_symptoms = matched;
            top_condition = Object.keys(scores)[0] || "";
        }

        const data = {
            valid_symptoms,
            invalid_symptoms,
            suggested_matches,
            prioritized_conditions,
            matched_symptoms,
            top_condition
        };

        let html = `<h3>Prioritized conditions (based on ${data.valid_symptoms?.length || 0} symptoms):</h3>`;
        
        if (data.invalid_symptoms && data.invalid_symptoms.length > 0) {
            html += '<div class="warnings"><h4>Warning: The following symptoms were not recognized:</h4>';
            data.invalid_symptoms.forEach(symptom => { html += `<p>- '${symptom}'</p>`; });
            if (data.suggested_matches) {
                Object.entries(data.suggested_matches).forEach(([invalid, matches]) => {
                    html += `<p>Suggested matches for '${invalid}':</p>`;
                    matches.forEach(match => {
                        html += `<p class="suggested-match" data-full="${match.full}" onclick="replaceSymptom('${invalid}', '${match.simple}')">• ${match.simple} (${(match.similarity * 100).toFixed(1)}% match)</p>`;
                    });
                });
            }
            html += '</div>';
        }

        if (data.top_condition) {
            html += `<div class="top-recommendation"><h2>TOP RECOMMENDATION: ${data.top_condition}</h2>`;
            if (conditionUrls[data.top_condition]) {
                html += `<p><a href="${conditionUrls[data.top_condition]}" target="_blank" class="condition-link">Learn more about ${data.top_condition}</a></p>`;
            }
            html += `</div>`;
        }

        // Sunburst chart container
        html += '<div id="sunburstChart" style="width:100%; height:500px; margin-top: 20px;"></div>';

        if (Object.keys(data.prioritized_conditions || {}).length > 1) {
            html += '<div class="other-conditions"><h4>Other potential conditions:</h4>';
            const sortedConditions = Object.entries(data.prioritized_conditions).sort((a, b) => b[1] - a[1]);
            sortedConditions.slice(1, 4).forEach(([condition, score]) => {
                if (score > 0) {
                    html += `<p class="other-condition">- ${condition}: ${score} matching symptoms`;
                    if (conditionUrls[condition]) html += ` (<a href="${conditionUrls[condition]}" target="_blank">More Info</a>)`;
                    html += `</p>`;
                }
            });
            html += '</div>';
        }
        
        html += '<div class="conditions-grid">';
        Object.entries(data.prioritized_conditions || {}).forEach(([condition, score]) => {
            const matched = data.matched_symptoms[condition] || [];
            const url = conditionUrls[condition] || null;
            html += `
                <div class="condition-card">
                    <h4>${condition}</h4>
                    <p class="score">Score: ${score} matching symptom(s)</p>
                    <p class="matched">Matched: ${matched.join(', ') || 'None'}</p>
                    ${url ? `<p><a href="${url}" target="_blank" class="condition-link">More Info</a></p>` : ""}
                </div>
            `;
        });
        html += '</div>';

        if (Object.keys(data.prioritized_conditions || {}).length === 0) {
            html += '<p>No conditions match the provided symptoms.</p>';
        }

        resultsDiv.innerHTML = `<div class="results-content">${html}</div>`;

        // Sunburst Chart
        let labels = ["Potential Conditions"];
        let parents = [""];
        let values = [0];
        let hovertext = ["Root node with all potential conditions"];
        let colors = ["#f0f0f0"];
        let totalScore = 0;

        Object.entries(data.prioritized_conditions || {}).forEach(([condition, score]) => {
            labels.push(condition);
            parents.push("Potential Conditions");
            values.push(score);
            hovertext.push(`Condition: ${condition}<br>Score: ${score}`);
            totalScore += score;
            colors.push(condition === data.top_condition ? "#28a745" : "#d3d3d3");
        });

        if (data.top_condition) {
            const matched = data.matched_symptoms[data.top_condition] || [];
            matched.forEach(sym => {
                labels.push(sym);
                parents.push(data.top_condition);
                values.push(1);
                hovertext.push(`Symptom: ${sym}<br>Contributes to ${data.top_condition}`);
                colors.push("#28a745");
            });
        }

        values[0] = totalScore;

        const chartData = [{
            type: "sunburst",
            labels: labels,
            parents: parents,
            values: values,
            hovertext: hovertext,
            hoverinfo: "text+value+percent parent",
            branchvalues: "total",
            marker: { line: {width: 2}, colors: colors }
        }];

        const layout = { margin: {l: 0, r: 0, b: 0, t: 0}, hovermode: 'closest' };
        Plotly.newPlot('sunburstChart', chartData, layout);

        // --- NEW: HPO extraction & Excel download ---
        if (data.top_condition) {
            const topCondition = data.top_condition;
            const matchedSymptoms = data.matched_symptoms[topCondition] || [];

            const hpoTerms = symptomConditionDf.symptoms
                .filter(sym => matchedSymptoms.some(ms => sym.toLowerCase().includes(ms.toLowerCase())))
                .map(sym => {
                    const match = sym.match(/\(HP:\d+\)/);
                    const hpo = match ? match[0].replace(/[()]/g, '') : '';
                    return { Symptom: sym.split('(')[0].trim(), HPO_ID: hpo };
                })
                .filter(row => row.HPO_ID !== '');

            if (hpoTerms.length > 0) {
                const hpoHtml = `
                    <div class="hpo-section">
                        <h3>HPO Terms for ${topCondition}:</h3>
                        <table class="hpo-table">
                            <tr><th>Symptom</th><th>HPO ID</th></tr>
                            ${hpoTerms.map(r => `<tr><td>${r.Symptom}</td><td>${r.HPO_ID}</td></tr>`).join('')}
                        </table>
                        <button id="downloadHpoBtn" class="download-btn">📥 Download HPO Excel</button>
                    </div>
                `;
                resultsDiv.querySelector('.results-content').insertAdjacentHTML('beforeend', hpoHtml);

                document.getElementById('downloadHpoBtn').addEventListener('click', () => {
                    const wsData = [["Symptom", "HPO_ID"], ...hpoTerms.map(r => [r.Symptom, r.HPO_ID])];
                    const wb = XLSX.utils.book_new();
                    const ws = XLSX.utils.aoa_to_sheet(wsData);
                    XLSX.utils.book_append_sheet(wb, ws, "HPO_Terms");
                    XLSX.writeFile(wb, `${topCondition.replace(/\s+/g, '_')}_HPO_Terms.xlsx`);
                });
            }
        }

    } catch (error) {
        resultsDiv.innerHTML = `<div class="error"><p>Error: ${error.message}. Ensure the data files are available.</p></div>`;
    }

    analyzeBtn.disabled = false;
    analyzeBtn.innerHTML = 'Analyze Symptoms';
});

// Replace invalid symptom
function replaceSymptom(invalid, simple) {
    const index = symptoms.indexOf(invalid);
    if (index > -1) {
        symptoms[index] = simple;
        updateAddedList();
        if (confirm(`Replaced '${invalid}' with '${simple}'. Re-analyze?`)) analyzeBtn.click();
    }
}

// Initialize
(async () => {
    const loaded = await loadData();
    if (loaded) await fetchAllSymptoms();
    else resultsDiv.innerHTML = `<div class="error"><p>Error: Failed to load data files.</p></div>`;
})();

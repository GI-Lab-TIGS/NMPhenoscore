// Check if we're on the correct page
const symptomInputElement = document.getElementById("symptomInput");
if (!symptomInputElement) {
    console.log("Step2 DOM not found. script.js safely skipped.");
} else {
    // Main application code
    let symptoms = [];
    const commonSymptoms = [
        'Pyloric atresia', 'Retinopathy', 'Rippling muscles', 'Hyperreflexia', 
        'Polyhill sign', 'Hypogonadism ', 'Muscle weakness', 
        'Progressive muscle degeneration', 'Elevated creatinine phosphokinase',
        'Scoliosis', 'Joint contractures', 'Cardiac abnormalities', 
        'Respiratory failure', 'Developmental delay'
    ];

    let symptomConditionDf = null;
    let allSymptoms = [];
    let symptomMapping = {};
    let conditionUrls = {};
    let isDataLoaded = false;

    function lcsLength(s1, s2) {
        const m = s1.length, n = s2.length;
        const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (s1[i - 1] === s2[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
                else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
        return dp[m][n];
    }

    function sequenceMatcherRatio(s1, s2) {
        s1 = s1.toLowerCase(); s2 = s2.toLowerCase();
        if (s1.length === 0 && s2.length === 0) return 1.0;
        if (s1.length === 0 || s2.length === 0) return 0.0;
        const lcs = lcsLength(s1, s2);
        return 2.0 * lcs / (s1.length + s2.length);
    }

    function extractSymptomName(fullSymptomText) {
        if (fullSymptomText.includes('(') && fullSymptomText.includes(')')) {
            return fullSymptomText.split('(')[0].trim();
        }
        return fullSymptomText.trim();
    }

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

        const sortedScores = Object.entries(conditionScores).filter(([, score]) => score > 0).sort(([, a], [, b]) => b - a);
        const prioritizedConditions = {};
        for (const [condition, score] of sortedScores) prioritizedConditions[condition] = score;

        const matchedSymptomsDict = {};
        for (const condition of symptomConditionDf.conditions) {
            const matchedFull = [];
            const colIdx = symptomConditionDf.conditions.indexOf(condition);
            for (let rowIdx = 0; rowIdx < symptomIndices.length; rowIdx++) {
                const dataIdx = symptomIndices[rowIdx];
                if (symptomConditionDf.data[dataIdx][colIdx] === 1) {
                    const fullSymptom = symptomConditionDf.symptoms[dataIdx];
                    matchedFull.push(extractSymptomName(fullSymptom));
                }
            }
            matchedSymptomsDict[condition] = matchedFull;
        }
        return { scores: prioritizedConditions, matched: matchedSymptomsDict };
    }

    async function loadData() {
        try {
            console.log('Loading data...');
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

            console.log('Data loaded successfully');
            isDataLoaded = true;
            return true;
        } catch (e) {
            console.error(`Error: ${e}`);
            isDataLoaded = false;
            return false;
        }
    }

    async function fetchAllSymptoms() {
        if (!symptomConditionDf) return;
        const simpleSymptoms = allSymptoms.map(extractSymptomName);
        const uniqueSorted = [...new Set(simpleSymptoms)].sort();
        const datalist = document.getElementById('symptomSuggestions');
        if (!datalist) return;
        uniqueSorted.forEach(sym => {
            const option = document.createElement('option');
            option.value = sym;
            datalist.appendChild(option);
        });
    }

    const input = document.getElementById('symptomInput');
    const addBtn = document.getElementById('addBtn');
    const addedList = document.getElementById('addedSymptoms');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const resultsDiv = document.getElementById('results');
    const clearBtn = document.getElementById('clearSymptoms');

    if (addBtn) addBtn.disabled = true;
    if (analyzeBtn) analyzeBtn.disabled = true;

    function addSymptom() {
        if (!isDataLoaded) { alert('Please wait, data is loading...'); return; }
        const symptom = input.value.trim();
        if (!symptom) return;
        if (symptoms.includes(symptom)) { alert('Already added'); return; }
        symptoms.push(symptom);
        updateAddedList();
        input.value = '';
        updateAnalyzeBtn();
        document.querySelectorAll('.common-symptoms button').forEach(btn => {
            if (btn.dataset.symptom === symptom) { btn.disabled = true; btn.style.opacity = '0.5'; }
        });
    }

    if (addBtn) addBtn.addEventListener('click', addSymptom);
    if (input) input.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); addSymptom(); }});

    function setupCommonSymptomButtons() {
        document.querySelectorAll('.common-symptoms button').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!isDataLoaded) { alert('Data loading...'); return; }
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
    }

    function updateAddedList() {
        if (!addedList) return;
        addedList.innerHTML = '';
        symptoms.forEach((symptom, index) => {
            const div = document.createElement('div');
            div.className = 'symptom-item';
            const span = document.createElement('span');
            span.textContent = symptom;
            const button = document.createElement('button');
            button.type = 'button';
            button.innerHTML = '<i class="fas fa-times"></i>';
            button.addEventListener('click', () => removeSymptom(index));
            div.appendChild(span);
            div.appendChild(button);
            addedList.appendChild(div);
        });
        if (clearBtn) clearBtn.style.display = symptoms.length > 0 ? 'block' : 'none';
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

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            symptoms = [];
            updateAddedList();
            updateAnalyzeBtn();
            document.querySelectorAll('.common-symptoms button').forEach(btn => {
                btn.disabled = false; btn.style.opacity = '1';
            });
        });
    }

    function updateAnalyzeBtn() { 
        if (analyzeBtn) analyzeBtn.disabled = symptoms.length === 0 || !isDataLoaded;
    }

    async function generateComprehensivePDF() {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 20;
        let yPos = margin;

        pdf.setFillColor(59, 130, 246);
        pdf.rect(0, 0, pageWidth, 40, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(24);
        pdf.setFont('helvetica', 'bold');
        pdf.text('NMphenoscore Report', pageWidth / 2, 20, { align: 'center' });
        pdf.setFontSize(12);
        pdf.text('Complete NMGD Assessment', pageWidth / 2, 30, { align: 'center' });

        yPos = 50;
        pdf.setTextColor(0, 0, 0);

        const reportDate = new Date().toLocaleDateString();
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`Report Generated: ${reportDate}`, pageWidth - margin, yPos, { align: 'right' });
        yPos += 10;

        if (yPos > pageHeight - 60) { pdf.addPage(); yPos = margin; }

        pdf.setFillColor(30, 58, 138);
        pdf.rect(margin, yPos, pageWidth - 2 * margin, 10, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(13);
        pdf.setFont('helvetica', 'bold');
        pdf.text('STEP 2: Specific Condition Analysis', margin + 3, yPos + 7);
        yPos += 15;
        pdf.setTextColor(0, 0, 0);

        const topCondition = localStorage.getItem('step2TopCondition') || 'No significant condition identified';
        pdf.setFillColor(16, 185, 129);
        pdf.roundedRect(margin, yPos, pageWidth - 2 * margin, 15, 3, 3, 'F');
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(13);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`TOP RECOMMENDATION: ${topCondition}`, pageWidth / 2, yPos + 10, { align: 'center' });
        yPos += 20;
        pdf.setTextColor(0, 0, 0);

        const validSymptoms = JSON.parse(localStorage.getItem('step2ValidSymptoms') || '[]');
        if (validSymptoms.length > 0) {
            pdf.setFontSize(12);
            pdf.setFont('helvetica', 'bold');
            pdf.text(`Analyzed Symptoms (${validSymptoms.length})`, margin, yPos);
            yPos += 7;
            pdf.setFontSize(9);
            pdf.setFont('helvetica', 'normal');
            validSymptoms.forEach(symptom => {
                if (yPos > pageHeight - 30) { pdf.addPage(); yPos = margin; }
                const lines = pdf.splitTextToSize(`• ${symptom}`, pageWidth - 2 * margin - 10);
                pdf.text(lines, margin + 5, yPos);
                yPos += lines.length * 4.5;
            });
            yPos += 5;
        }

        const prioritized = JSON.parse(localStorage.getItem('step2PrioritizedConditions') || '{}');
        const matched = JSON.parse(localStorage.getItem('step2MatchedSymptoms') || '{}');

        if (Object.keys(prioritized).length > 0) {
            if (yPos > pageHeight - 80) { pdf.addPage(); yPos = margin; }
            pdf.setFontSize(12);
            pdf.setFont('helvetica', 'bold');
            pdf.text('Prioritized Conditions', margin, yPos);
            yPos += 10;

            Object.entries(prioritized).slice(0, 6).forEach(([condition, score], index) => {
                if (yPos > pageHeight - 50) { pdf.addPage(); yPos = margin; }
                const boxHeight = 30;
                pdf.setDrawColor(200, 200, 200);
                pdf.setLineWidth(0.3);
                pdf.rect(margin, yPos, pageWidth - 2 * margin, boxHeight);
                if (index === 0) {
                    pdf.setFillColor(240, 253, 244);
                    pdf.rect(margin, yPos, pageWidth - 2 * margin, boxHeight, 'F');
                    pdf.rect(margin, yPos, pageWidth - 2 * margin, boxHeight);
                }
                pdf.setFontSize(10);
                pdf.setFont('helvetica', 'bold');
                pdf.text(`${index + 1}. ${condition}`, margin + 3, yPos + 6);
                pdf.setFontSize(9);
                pdf.setFont('helvetica', 'normal');
                pdf.text(`Score: ${score} matching symptom(s)`, margin + 3, yPos + 12);
                const matchedSymptoms = matched[condition] || [];
                if (matchedSymptoms.length > 0) {
                    const matchText = `Matched: ${matchedSymptoms.join(', ')}`;
                    const lines = pdf.splitTextToSize(matchText, pageWidth - 2 * margin - 8);
                    pdf.text(lines, margin + 3, yPos + 17);
                }
                yPos += boxHeight + 4;
            });
        }

        const hpoTerms = JSON.parse(localStorage.getItem('step2HpoTerms') || '[]');
        if (hpoTerms.length > 0) {
            if (yPos > pageHeight - 60) { pdf.addPage(); yPos = margin; }
            pdf.setFontSize(12);
            pdf.setFont('helvetica', 'bold');
            pdf.text(`HPO Terms for ${topCondition}`, margin, yPos);
            yPos += 10;
            pdf.setFillColor(240, 240, 240);
            pdf.rect(margin, yPos, pageWidth - 2 * margin, 8, 'F');
            pdf.setFontSize(9);
            pdf.setFont('helvetica', 'bold');
            pdf.text('Symptom', margin + 2, yPos + 5);
            pdf.text('HPO ID', pageWidth - margin - 30, yPos + 5);
            yPos += 10;
            pdf.setFont('helvetica', 'normal');
            hpoTerms.forEach((row, index) => {
                if (yPos > pageHeight - 25) { pdf.addPage(); yPos = margin; }
                if (index % 2 === 0) {
                    pdf.setFillColor(250, 250, 250);
                    pdf.rect(margin, yPos - 4, pageWidth - 2 * margin, 7, 'F');
                }
                const symptomLines = pdf.splitTextToSize(row.Symptom, pageWidth - 2 * margin - 35);
                pdf.text(symptomLines, margin + 2, yPos);
                pdf.text(row.HPO_ID, pageWidth - margin - 30, yPos);
                yPos += Math.max(symptomLines.length * 4.5, 7);
            });
        }

        yPos = pageHeight - 20;
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'italic');
        pdf.setTextColor(100, 100, 100);
        const disclaimer = 'Disclaimer: This tool is for informational purposes only. Always consult qualified healthcare professionals.';
        const disclaimerLines = pdf.splitTextToSize(disclaimer, pageWidth - 2 * margin);
        pdf.text(disclaimerLines, pageWidth / 2, yPos, { align: 'center' });

        const patientName = localStorage.getItem('patientName') || 'Patient';
        pdf.save(`NMphenoscore_${patientName.replace(/\s+/g, '_')}_${reportDate}.pdf`);
    }

    if (analyzeBtn) {
        analyzeBtn.onclick = async () => {
            if (!symptomConditionDf) {
                resultsDiv.innerHTML = `<div class="error"><p>Data not loaded. Refresh page.</p></div>`;
                return;
            }

            analyzeBtn.disabled = true;
            analyzeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analyzing...';
            resultsDiv.innerHTML = '<p><i class="fas fa-spinner fa-spin"></i> Analyzing...</p>';

            try {
                const valid_symptoms = [], invalid_symptoms = [], suggested_matches = {};
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

                let prioritized_conditions = {}, matched_symptoms = {}, top_condition = "";
                if (valid_symptoms.length > 0) {
                    const { scores, matched } = prioritizeConditions(valid_symptoms, symptomConditionDf, symptomMapping);
                    prioritized_conditions = scores;
                    matched_symptoms = matched;
                    top_condition = Object.keys(scores)[0] || "";
                }

                const data = { valid_symptoms, invalid_symptoms, suggested_matches, prioritized_conditions, matched_symptoms, top_condition };

                localStorage.setItem("step2TopCondition", data.top_condition || "");
                localStorage.setItem("step2PrioritizedConditions", JSON.stringify(data.prioritized_conditions || {}));
                localStorage.setItem("step2MatchedSymptoms", JSON.stringify(data.matched_symptoms || {}));
                localStorage.setItem("step2ValidSymptoms", JSON.stringify(data.valid_symptoms || []));
                localStorage.setItem("step2InvalidSymptoms", JSON.stringify(data.invalid_symptoms || []));

                let html = `<h3>Prioritized conditions (${data.valid_symptoms?.length || 0} symptoms):</h3>`;
                
                if (data.invalid_symptoms && data.invalid_symptoms.length > 0) {
                    html += '<div class="warnings"><h4>Unrecognized symptoms:</h4>';
                    data.invalid_symptoms.forEach(symptom => { html += `<p>- '${symptom}'</p>`; });
                    if (data.suggested_matches) {
                        Object.entries(data.suggested_matches).forEach(([invalid, matches]) => {
                            html += `<p>Suggestions for '${invalid}':</p>`;
                            matches.forEach(match => {
                                html += `<p class="suggested-match" onclick="replaceSymptom('${invalid}', '${match.simple}')">• ${match.simple} (${(match.similarity * 100).toFixed(1)}%)</p>`;
                            });
                        });
                    }
                    html += '</div>';
                }

                if (data.top_condition) {
                    html += `<div class="top-recommendation"><h2>TOP: ${data.top_condition}</h2>`;
                    if (conditionUrls[data.top_condition]) html += `<p><a href="${conditionUrls[data.top_condition]}" target="_blank">Learn more</a></p>`;
                    html += `</div>`;
                }

                html += '<div id="sunburstChart" style="width:100%; height:500px; margin-top: 20px;"></div>';

                if (Object.keys(data.prioritized_conditions || {}).length > 1) {
                    html += '<div class="other-conditions"><h4>Other conditions:</h4>';
                    Object.entries(data.prioritized_conditions).sort((a, b) => b[1] - a[1]).slice(1, 4).forEach(([condition, score]) => {
                        if (score > 0) {
                            html += `<p>- ${condition}: ${score} symptoms`;
                            if (conditionUrls[condition]) html += ` (<a href="${conditionUrls[condition]}" target="_blank">Info</a>)`;
                            html += `</p>`;
                        }
                    });
                    html += '</div>';
                }
                
                html += '<div class="conditions-grid">';
                Object.entries(data.prioritized_conditions || {}).forEach(([condition, score]) => {
                    const matched = data.matched_symptoms[condition] || [];
                    const url = conditionUrls[condition] || null;
                    html += `<div class="condition-card"><h4>${condition}</h4><p class="score">Score: ${score}</p><p class="matched">Matched: ${matched.join(', ') || 'None'}</p>${url ? `<p><a href="${url}" target="_blank">Info</a></p>` : ""}</div>`;
                });
                html += '</div>';

                if (Object.keys(data.prioritized_conditions || {}).length === 0) html += '<p>No matches.</p>';

                html += '<div style="text-align: center; margin-top: 30px;"><button id="downloadCompletePDF" class="pdf-button" style="padding: 14px 40px; background: #dc2626; color: white; border: none; border-radius: 8px; font-size: 1.1em; cursor: pointer;">📄 Download Report</button></div>';

                resultsDiv.innerHTML = `<div class="results-content">${html}</div>`;

                const pdfBtn = document.getElementById('downloadCompletePDF');
                if (pdfBtn) pdfBtn.addEventListener('click', generateComprehensivePDF);

                if (typeof Plotly !== 'undefined') {
                    let labels = ["Conditions"], parents = [""], values = [0], hovertext = ["Root"], colors = ["#f0f0f0"], totalScore = 0;
                    Object.entries(data.prioritized_conditions || {}).forEach(([condition, score]) => {
                        labels.push(condition); parents.push("Conditions"); values.push(score);
                        hovertext.push(`${condition}<br>Score: ${score}`); totalScore += score;
                        colors.push(condition === data.top_condition ? "#28a745" : "#d3d3d3");
                    });
                    if (data.top_condition) {
                        const matched = data.matched_symptoms[data.top_condition] || [];
                        matched.forEach(sym => {
                            labels.push(sym); parents.push(data.top_condition); values.push(1);
                            hovertext.push(`${sym}<br>Contributes to ${data.top_condition}`); colors.push("#28a745");
                        });
                    }
                    values[0] = totalScore;
                    const chartData = [{ type: "sunburst", labels, parents, values, hovertext, hoverinfo: "text+value+percent parent", branchvalues: "total", marker: { line: {width: 2}, colors } }];
                    Plotly.newPlot('sunburstChart', chartData, { margin: {l: 0, r: 0, b: 0, t: 0}, hovermode: 'closest' });
                }

                if (data.top_condition && typeof XLSX !== 'undefined') {
                    const topCondition = data.top_condition;
                    const matchedSymptoms = data.matched_symptoms[topCondition] || [];
                    const hpoTerms = symptomConditionDf.symptoms.filter(sym => matchedSymptoms.some(ms => sym.toLowerCase().includes(ms.toLowerCase()))).map(sym => {
                        const match = sym.match(/\(HP:\d+\)/);
                        return { Symptom: sym.split('(')[0].trim(), HPO_ID: match ? match[0].replace(/[()]/g, '') : '' };
                    }).filter(row => row.HPO_ID !== '');

                    if (hpoTerms.length > 0) {
                        const hpoHtml = `<div class="hpo-section"><h3>HPO Terms for ${topCondition}:</h3><table class="hpo-table"><tr><th>Symptom</th><th>HPO ID</th></tr>${hpoTerms.map(r => `<tr><td>${r.Symptom}</td><td>${r.HPO_ID}</td></tr>`).join('')}</table><button id="downloadHpoBtn" class="download-btn">📥 Download HPO Excel</button></div>`;
                        resultsDiv.querySelector('.results-content').insertAdjacentHTML('beforeend', hpoHtml);
                        document.getElementById('downloadHpoBtn').addEventListener('click', () => {
                            const wsData = [["Symptom", "HPO_ID"], ...hpoTerms.map(r => [r.Symptom, r.HPO_ID])];
                            const wb = XLSX.utils.book_new();
                            const ws = XLSX.utils.aoa_to_sheet(wsData);
                            XLSX.utils.book_append_sheet(wb, ws, "HPO_Terms");
                            XLSX.writeFile(wb, `${topCondition.replace(/\s+/g, '_')}_HPO_Terms.xlsx`);
                        });
                        localStorage.setItem("step2HpoTerms", JSON.stringify(hpoTerms));
                    }
                }

            } catch (error) {
                resultsDiv.innerHTML = `<div class="error"><p>Error: ${error.message}</p></div>`;
            }

            analyzeBtn.disabled = false;
            analyzeBtn.innerHTML = 'Analyze Symptoms';
        };
    }

    window.replaceSymptom = function(invalid, simple) {
        const index = symptoms.indexOf(invalid);
        if (index > -1) {
            symptoms[index] = simple;
            updateAddedList();
            if (confirm(`Replaced '${invalid}' with '${simple}'. Re-analyze?`)) analyzeBtn.click();
        }
    }

    (async () => {
        const loaded = await loadData();
        if (loaded) {
            await fetchAllSymptoms();
            if (addBtn) addBtn.disabled = false;
            setupCommonSymptomButtons();
            console.log('System ready');
        } else {
            resultsDiv.innerHTML = `<div class="error"><p>Failed to load data files.</p></div>`;
        }
    })();
}

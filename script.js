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

// Comprehensive PDF Generation for Step 1 + Step 2
async function generateComprehensivePDF() {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 20;
    let yPos = margin;

    // ========== HEADER ==========
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

    // ========== PATIENT INFORMATION ==========
    const patientName = localStorage.getItem('patientName') || 'N/A';
    const patientAge = localStorage.getItem('patientAge') || 'N/A';
    const patientContact = localStorage.getItem('patientContact') || 'N/A';
    const reportDate = new Date().toLocaleDateString();

    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Report Generated: ${reportDate}`, pageWidth - margin, yPos, { align: 'right' });
    yPos += 10;

    // ========== STEP 2: CONDITION ANALYSIS ==========
    if (yPos > pageHeight - 60) {
        pdf.addPage();
        yPos = margin;
    }

    pdf.setFillColor(30, 58, 138);
    pdf.rect(margin, yPos, pageWidth - 2 * margin, 10, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(13);
    pdf.setFont('helvetica', 'bold');
    pdf.text('STEP 2: Specific Condition Analysis', margin + 3, yPos + 7);
    yPos += 15;
    pdf.setTextColor(0, 0, 0);

    // Top Condition
    const topCondition = localStorage.getItem('step2TopCondition') || 'No significant condition identified';
    
    pdf.setFillColor(16, 185, 129);
    pdf.roundedRect(margin, yPos, pageWidth - 2 * margin, 15, 3, 3, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(13);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`TOP RECOMMENDATION: ${topCondition}`, pageWidth / 2, yPos + 10, { align: 'center' });
    yPos += 20;

    pdf.setTextColor(0, 0, 0);

    // Valid Symptoms from Step 2
    const validSymptoms = JSON.parse(localStorage.getItem('step2ValidSymptoms') || '[]');
    if (validSymptoms.length > 0) {
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`Analyzed Symptoms (${validSymptoms.length})`, margin, yPos);
        yPos += 7;

        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'normal');
        validSymptoms.forEach((symptom, index) => {
            if (yPos > pageHeight - 30) {
                pdf.addPage();
                yPos = margin;
            }
            const lines = pdf.splitTextToSize(`• ${symptom}`, pageWidth - 2 * margin - 10);
            pdf.text(lines, margin + 5, yPos);
            yPos += lines.length * 4.5;
        });
        yPos += 5;
    }

    // Prioritized Conditions
    const prioritized = JSON.parse(localStorage.getItem('step2PrioritizedConditions') || '{}');
    const matched = JSON.parse(localStorage.getItem('step2MatchedSymptoms') || '{}');

    if (Object.keys(prioritized).length > 0) {
        if (yPos > pageHeight - 80) {
            pdf.addPage();
            yPos = margin;
        }

        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Prioritized Conditions', margin, yPos);
        yPos += 10;

        Object.entries(prioritized).slice(0, 6).forEach(([condition, score], index) => {
            if (yPos > pageHeight - 50) {
                pdf.addPage();
                yPos = margin;
            }

            // Condition box
            const boxHeight = 30;
            pdf.setDrawColor(200, 200, 200);
            pdf.setLineWidth(0.3);
            pdf.rect(margin, yPos, pageWidth - 2 * margin, boxHeight);

            // Highlight top condition
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

    // HPO Terms
    const hpoTerms = JSON.parse(localStorage.getItem('step2HpoTerms') || '[]');
    if (hpoTerms.length > 0) {
        if (yPos > pageHeight - 60) {
            pdf.addPage();
            yPos = margin;
        }

        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`HPO Terms for ${topCondition}`, margin, yPos);
        yPos += 10;

        // Table header
        pdf.setFillColor(240, 240, 240);
        pdf.rect(margin, yPos, pageWidth - 2 * margin, 8, 'F');
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Symptom', margin + 2, yPos + 5);
        pdf.text('HPO ID', pageWidth - margin - 30, yPos + 5);
        yPos += 10;

        // Table rows
        pdf.setFont('helvetica', 'normal');
        hpoTerms.forEach((row, index) => {
            if (yPos > pageHeight - 25) {
                pdf.addPage();
                yPos = margin;
            }

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

    // Disclaimer
    yPos = pageHeight - 20;
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(100, 100, 100);
    const disclaimer = 'Disclaimer: This tool is for informational purposes only and should not be used as a substitute for professional medical advice, diagnosis, or treatment. Always consult with qualified healthcare professionals for proper diagnosis and treatment.';
    const disclaimerLines = pdf.splitTextToSize(disclaimer, pageWidth - 2 * margin);
    pdf.text(disclaimerLines, pageWidth / 2, yPos, { align: 'center' });

    // Save PDF
    pdf.save(`NMphenoscore_Complete_${patientName.replace(/\s+/g, '_')}_${reportDate}.pdf`);
}

    pdf.setFillColor(240, 240, 240);
    pdf.roundedRect(margin, yPos, pageWidth - 2 * margin, 25, 2, 2, 'F');
    
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Patient Information', margin + 5, yPos + 7);
    yPos += 12;

    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Name: ${patientName}`, margin + 5, yPos);
    yPos += 6;
    pdf.text(`Age: ${patientAge} years`, margin + 5, yPos);
    yPos += 6;
    pdf.text(`Contact: ${patientContact}`, margin + 5, yPos);
    yPos += 15;

    // ========== STEP 1: INITIAL SCREENING RESULTS ==========
    pdf.setFillColor(30, 58, 138);
    pdf.rect(margin, yPos, pageWidth - 2 * margin, 10, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(13);
    pdf.setFont('helvetica', 'bold');
    pdf.text('STEP 1: Initial NMGD Screening', margin + 3, yPos + 7);
    yPos += 15;
    pdf.setTextColor(0, 0, 0);

    const step1Score = localStorage.getItem('step1Score') || '0.0%';
    const step1Status = localStorage.getItem('step1Status') || 'Likely NMGD Negative';
    const totalSymptoms = localStorage.getItem('step1TotalSymptoms') || '24';
    const selectedCount = localStorage.getItem('step1SelectedCount') || '0';

    // Score Box
    pdf.setDrawColor(59, 130, 246);
    pdf.setLineWidth(0.5);
    pdf.rect(margin, yPos, pageWidth - 2 * margin, 28);

    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`Assessment Score: ${step1Score}`, pageWidth / 2, yPos + 10, { align: 'center' });
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Symptoms Selected: ${selectedCount} out of ${totalSymptoms}`, pageWidth / 2, yPos + 18, { align: 'center' });

    yPos += 33;

    // Status
    const isPositive = step1Status.includes('Positive');
    pdf.setFillColor(isPositive ? 16 : 245, isPositive ? 185 : 158, isPositive ? 129 : 11);
    pdf.roundedRect(margin, yPos, pageWidth - 2 * margin, 12, 3, 3, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'bold');
    pdf.text(step1Status, pageWidth / 2, yPos + 8, { align: 'center' });

    yPos += 17;
    pdf.setTextColor(0, 0, 0);

    // Selected Symptoms from Step 1
    const selectedSymptoms = JSON.parse(localStorage.getItem('step1Symptoms') || '[]');
    if (selectedSymptoms.length > 0) {
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Selected Symptoms:', margin, yPos);
        yPos += 7;

        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'normal');

        selectedSymptoms.forEach((symptom, index) => {
            if (yPos > pageHeight - 30) {
                pdf.addPage();
                yPos = margin;
            }
            const lines = pdf.splitTextToSize(`${index + 1}. ${symptom}`, pageWidth - 2 * margin - 10);
            pdf.text(lines, margin + 5, yPos);
            yPos += lines.length * 4.5;
        });
    }

    yPos += 10;

    // Top Condition
    const topCondition = localStorage.getItem('step2TopCondition') || 'No significant condition identified';
    
    pdf.setFillColor(16, 185, 129);
    pdf.roundedRect(margin, yPos, pageWidth - 2 * margin, 15, 3, 3, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`TOP RECOMMENDATION: ${topCondition}`, pageWidth / 2, yPos + 10, { align: 'center' });
    yPos += 20;

    pdf.setTextColor(0, 0, 0);

    // Valid Symptoms
    const validSymptoms = JSON.parse(localStorage.getItem('step2ValidSymptoms') || '[]');
    if (validSymptoms.length > 0) {
        pdf.setFontSize(13);
        pdf.setFont('helvetica', 'bold');
        pdf.text(`Analyzed Symptoms (${validSymptoms.length})`, margin, yPos);
        yPos += 8;

        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'normal');
        validSymptoms.forEach((symptom, index) => {
            if (yPos > pageHeight - 30) {
                pdf.addPage();
                yPos = margin;
            }
            const lines = pdf.splitTextToSize(`• ${symptom}`, pageWidth - 2 * margin - 10);
            pdf.text(lines, margin + 5, yPos);
            yPos += lines.length * 5;
        });
        yPos += 5;
    }

    // Prioritized Conditions
    const prioritized = JSON.parse(localStorage.getItem('step2PrioritizedConditions') || '{}');
    const matched = JSON.parse(localStorage.getItem('step2MatchedSymptoms') || '{}');

    if (Object.keys(prioritized).length > 0) {
        if (yPos > pageHeight - 80) {
            pdf.addPage();
            yPos = margin;
        }

        pdf.setFontSize(13);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Prioritized Conditions', margin, yPos);
        yPos += 10;

        Object.entries(prioritized).slice(0, 5).forEach(([condition, score], index) => {
            if (yPos > pageHeight - 50) {
                pdf.addPage();
                yPos = margin;
            }

            // Condition box
            const boxHeight = 35;
            pdf.setDrawColor(200, 200, 200);
            pdf.setLineWidth(0.3);
            pdf.rect(margin, yPos, pageWidth - 2 * margin, boxHeight);

            pdf.setFontSize(11);
            pdf.setFont('helvetica', 'bold');
            pdf.text(`${index + 1}. ${condition}`, margin + 3, yPos + 6);

            pdf.setFontSize(10);
            pdf.setFont('helvetica', 'normal');
            pdf.text(`Score: ${score} matching symptom(s)`, margin + 3, yPos + 12);

            const matchedSymptoms = matched[condition] || [];
            if (matchedSymptoms.length > 0) {
                const matchText = `Matched: ${matchedSymptoms.join(', ')}`;
                const lines = pdf.splitTextToSize(matchText, pageWidth - 2 * margin - 8);
                pdf.text(lines, margin + 3, yPos + 18);
            }

            yPos += boxHeight + 5;
        });
    }

    // HPO Terms
    const hpoTerms = JSON.parse(localStorage.getItem('step2HpoTerms') || '[]');
    if (hpoTerms.length > 0) {
        if (yPos > pageHeight - 60) {
            pdf.addPage();
            yPos = margin;
        }

        pdf.setFontSize(13);
        pdf.setFont('helvetica', 'bold');
        pdf.text('HPO Terms', margin, yPos);
        yPos += 10;

        // Table header
        pdf.setFillColor(240, 240, 240);
        pdf.rect(margin, yPos, pageWidth - 2 * margin, 8, 'F');
        pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Symptom', margin + 2, yPos + 5);
        pdf.text('HPO ID', pageWidth - margin - 30, yPos + 5);
        yPos += 10;

        // Table rows
        pdf.setFont('helvetica', 'normal');
        hpoTerms.forEach((row, index) => {
            if (yPos > pageHeight - 25) {
                pdf.addPage();
                yPos = margin;
            }

            if (index % 2 === 0) {
                pdf.setFillColor(250, 250, 250);
                pdf.rect(margin, yPos - 4, pageWidth - 2 * margin, 7, 'F');
            }

            const symptomLines = pdf.splitTextToSize(row.Symptom, pageWidth - 2 * margin - 35);
            pdf.text(symptomLines, margin + 2, yPos);
            pdf.text(row.HPO_ID, pageWidth - margin - 30, yPos);
            yPos += Math.max(symptomLines.length * 5, 7);
        });
    }

    // Disclaimer
    yPos = pageHeight - 20;
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'italic');
    pdf.setTextColor(100, 100, 100);
    const disclaimer = 'Disclaimer: This tool is for informational purposes only and should not be used as a substitute for professional medical advice, diagnosis, or treatment.';
    const disclaimerLines = pdf.splitTextToSize(disclaimer, pageWidth - 2 * margin);
    pdf.text(disclaimerLines, pageWidth / 2, yPos, { align: 'center' });

    // Save PDF
    pdf.save(`NMphenoscore_Step2_${patientName.replace(/\s+/g, '_')}_${reportDate}.pdf`);
}

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

        // Save Step 2 results
        localStorage.setItem("step2TopCondition", data.top_condition || "");
        localStorage.setItem("step2PrioritizedConditions", JSON.stringify(data.prioritized_conditions || {}));
        localStorage.setItem("step2MatchedSymptoms", JSON.stringify(data.matched_symptoms || {}));
        localStorage.setItem("step2ValidSymptoms", JSON.stringify(data.valid_symptoms || []));
        localStorage.setItem("step2InvalidSymptoms", JSON.stringify(data.invalid_symptoms || []));

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

        // Add PDF download button
        html += '<div style="text-align: center; margin-top: 30px;"><button id="downloadCompletePDF" class="pdf-button" style="padding: 14px 40px; background-color: #dc2626; color: white; border: none; border-radius: 8px; font-size: 1.1em; font-weight: 600; cursor: pointer; box-shadow: 0 4px 10px rgba(220, 38, 38, 0.3); transition: all 0.3s;">📄 Download Complete Report (Step 1 + Step 2)</button></div>';

        resultsDiv.innerHTML = `<div class="results-content">${html}</div>`;

        // Attach PDF download event
        document.getElementById('downloadCompletePDF').addEventListener('click', generateComprehensivePDF);

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

        // HPO extraction & Excel download
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
                localStorage.setItem("step2HpoTerms", JSON.stringify(hpoTerms));
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

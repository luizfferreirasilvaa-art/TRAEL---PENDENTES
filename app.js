document.addEventListener('DOMContentLoaded', () => {
    initDashboard();
    initUpload();
});

function initUpload() {
    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('file-input');
    const fileInfo = document.getElementById('file-info');
    const fileName = document.getElementById('file-name');
    const btnProcess = document.getElementById('btn-process');

    dropArea.addEventListener('click', () => fileInput.click());

    dropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropArea.classList.add('active');
    });

    dropArea.addEventListener('dragleave', () => {
        dropArea.classList.remove('active');
    });

    dropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dropArea.classList.remove('active');
        const files = e.dataTransfer.files;
        handleFiles(files);
    });

    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });

    function handleFiles(files) {
        if (files.length > 0) {
            const file = files[0];
            fileName.textContent = file.name;
            fileInfo.style.display = 'flex';
            dropArea.style.display = 'none';
        }
    }

    btnProcess.addEventListener('click', () => {
        alert('Planilha recebida! Agora você pode me explicar como mapear as colunas para atualizar os gráficos.');
    });
}

function initDashboard() {
    // Update Header
    document.getElementById('main-title').textContent = DASHBOARD_DATA.title;
    document.querySelector('.subtitle').textContent = DASHBOARD_DATA.subtitle;

    // Update Summary
    document.getElementById('total-pecas').textContent = DASHBOARD_DATA.totalPecas;
    
    DASHBOARD_DATA.weeks.forEach(week => {
        const pecasEl = document.getElementById(`semana-${week.id}-pecas`);
        if (pecasEl) {
            pecasEl.textContent = week.pecas;
            const parent = pecasEl.parentElement;
            const subtext = parent.querySelector('.card-subvalue');
            if (subtext) subtext.textContent = `${week.pedidos} pedidos`;
        }
    });

    // Render Charts
    renderWeeklyCharts();
    renderComparativeChart();

    // Render Table
    renderAtrasoTable();
}

function renderWeeklyCharts() {
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: { enabled: true }
        },
        scales: {
            y: {
                beginAtZero: true,
                grid: {
                    drawBorder: false,
                    color: '#f0f0f0',
                    borderDash: [5, 5]
                },
                ticks: {
                    stepSize: 2,
                    color: '#666'
                }
            },
            x: {
                grid: { display: false },
                ticks: { color: '#666' }
            }
        }
    };

    DASHBOARD_DATA.weeks.forEach(week => {
        const ctx = document.getElementById(`chart-semana-${week.id}`).getContext('2d');
        const labels = Object.keys(week.data).filter(key => week.data[key] > 0 || Object.keys(week.data).length <= 3);
        const values = labels.map(label => week.data[label]);

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: '#4f772d',
                    borderRadius: 4,
                    maxBarThickness: 80
                }]
            },
            options: {
                ...commonOptions,
                plugins: {
                    ...commonOptions.plugins,
                    datalabels: { // Note: Chart.js datalabels plugin would be needed for the numbers on top, 
                                 // but I'll simulate or omit for pure vanilla Chart.js simplicity unless requested.
                    }
                }
            },
            plugins: [{
                id: 'customLabels',
                afterDraw: (chart) => {
                    const ctx = chart.ctx;
                    chart.data.datasets.forEach((dataset, i) => {
                        const meta = chart.getDatasetMeta(i);
                        meta.data.forEach((bar, index) => {
                            const data = dataset.data[index];
                            if (data > 0) {
                                ctx.fillStyle = '#000';
                                ctx.textAlign = 'center';
                                ctx.font = 'bold 11px Inter';
                                ctx.fillText(data, bar.x, bar.y - 5);
                            }
                        });
                    });
                }
            }]
        });
    });
}

function renderComparativeChart() {
    const ctx = document.getElementById('chart-comparativo').getContext('2d');
    const labels = DASHBOARD_DATA.weeks.map(w => `Semana ${w.id}`);
    
    // Categories: JC, EMP, ENR
    const categories = ['JC', 'EMP', 'ENR'];
    const colors = ['#1a3311', '#385223', '#6a8a4f']; // Dark to light green variants

    const datasets = categories.map((cat, index) => ({
        label: cat,
        data: DASHBOARD_DATA.weeks.map(w => w.data[cat] || 0),
        backgroundColor: colors[index],
        borderRadius: 2
    }));

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { stacked: true, grid: { display: false } },
                y: { stacked: true, beginAtZero: true, grid: { color: '#f0f0f0' } }
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        boxWidth: 8,
                        padding: 20
                    }
                }
            }
        },
        plugins: [{
            id: 'stackedLabels',
            afterDraw: (chart) => {
                const ctx = chart.ctx;
                chart.data.datasets.forEach((dataset, i) => {
                    const meta = chart.getDatasetMeta(i);
                    meta.data.forEach((bar, index) => {
                        const data = dataset.data[index];
                        if (data > 0) {
                            ctx.fillStyle = '#fff';
                            ctx.textAlign = 'center';
                            ctx.font = 'bold 10px Inter';
                            ctx.fillText(data, bar.x, bar.y + (bar.height / 2) + 4);
                        }
                    });
                });
            }
        }]
    });
}

function renderAtrasoTable() {
    const tbody = document.getElementById('atraso-body');
    tbody.innerHTML = '';

    DASHBOARD_DATA.atrasos.forEach(item => {
        const tr = document.createElement('tr');
        
        const isHighAtraso = item.diasAtraso >= 20;

        tr.innerHTML = `
            <td>${item.pedido}</td>
            <td>${item.referencia}</td>
            <td>${item.cliente}</td>
            <td>${item.potencia}</td>
            <td><span class="badge-nucleo badge-${item.nucleo.toLowerCase()}">${item.nucleo}</span></td>
            <td>${item.semana}</td>
            <td>${item.dataPrevista}</td>
            <td><span class="atraso-value ${isHighAtraso ? 'atraso-high' : ''}">${item.diasAtraso} dias</span></td>
        `;
        
        tbody.appendChild(tr);
    });
}

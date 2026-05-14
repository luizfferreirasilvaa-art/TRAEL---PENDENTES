const DASHBOARD_DATA = {
    title: "Peças Pendentes PCP Abril — 2026",
    subtitle: "Acompanhamento das semanas pendentes PCP Abril",
    totalPecas: 17,
    weeks: [
        {
            id: 16,
            pecas: 6,
            pedidos: 6,
            data: {
                JC: 5,
                EMP: 1,
                ENR: 0
            }
        },
        {
            id: 17,
            pecas: 2,
            pedidos: 2,
            data: {
                JC: 0,
                EMP: 0,
                ENR: 2
            }
        },
        {
            id: 18,
            pecas: 9,
            pedidos: 6,
            data: {
                JC: 1,
                EMP: 6,
                ENR: 2
            }
        }
    ],
    atrasos: [
        { pedido: "65908", referencia: "TPD-398871", cliente: "ETO - Energisa TO", potencia: "15 kVA", nucleo: "JC", semana: 16, dataPrevista: "13/04/2026", diasAtraso: 24 },
        { pedido: "66725", referencia: "TPD-428955", cliente: "EQTL - PA", potencia: "150 kVA", nucleo: "EMP", semana: 16, dataPrevista: "15/04/2026", diasAtraso: 22 },
        { pedido: "65863", referencia: "TPD-413418", cliente: "Coelba - Jacuípe", potencia: "10 kVA", nucleo: "JC", semana: 16, dataPrevista: "15/04/2026", diasAtraso: 22 },
        { pedido: "65050", referencia: "TPD-413934", cliente: "Coelba - Vitória", potencia: "10 kVA", nucleo: "JC", semana: 16, dataPrevista: "15/04/2026", diasAtraso: 22 },
        { pedido: "65050", referencia: "TPD-413884", cliente: "Coelba - Vitória", potencia: "10 kVA", nucleo: "JC", semana: 16, dataPrevista: "16/04/2026", diasAtraso: 21 },
        { pedido: "65029", referencia: "TPD-378151", cliente: "EQTL - AL", potencia: "15 kVA", nucleo: "JC", semana: 16, dataPrevista: "17/04/2026", diasAtraso: 20 },
        { pedido: "65485", referencia: "TPD-378140", cliente: "EQTL - PA", potencia: "10 kVA", nucleo: "ENR", semana: 17, dataPrevista: "23/04/2026", diasAtraso: 14 },
        { pedido: "65485", referencia: "TPD-378140", cliente: "EQTL - PA", potencia: "10 kVA", nucleo: "ENR", semana: 17, dataPrevista: "24/04/2026", diasAtraso: 13 },
        { pedido: "66480", referencia: "TPD-378241", cliente: "EQTL - PA", potencia: "10 kVA", nucleo: "ENR", semana: 18, dataPrevista: "27/04/2026", diasAtraso: 10 },
        { pedido: "66480", referencia: "TPD-378241", cliente: "EQTL - PA", potencia: "10 kVA", nucleo: "ENR", semana: 18, dataPrevista: "28/04/2026", diasAtraso: 9 },
        { pedido: "63906", referencia: "TPD-429256", cliente: "TRAEL - Matriz", potencia: "45 kVA", nucleo: "EMP", semana: 18, dataPrevista: "28/04/2026", diasAtraso: 9 },
        { pedido: "65073", referencia: "TPD-390829", cliente: "Cemig D", potencia: "10 kVA", nucleo: "JC", semana: 18, dataPrevista: "29/04/2026", diasAtraso: 8 },
        { pedido: "64246", referencia: "TPD-399157", cliente: "DGA COMERCIO DE MATERIAIS ELETRICOS LTDA", potencia: "112,5 kVA", nucleo: "EMP", semana: 18, dataPrevista: "30/04/2026", diasAtraso: 7 },
        { pedido: "63191", referencia: "TPD-428600", cliente: "SHIRLEY MARIA SHIBAFUJI", potencia: "100 kVA", nucleo: "EMP", semana: 18, dataPrevista: "30/04/2026", diasAtraso: 7 }
    ]
};

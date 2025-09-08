// src/components/SalesView.js (Solo la función handlePrintLabels)

    const handlePrintLabels = async (format) => {
        if (selectedOrders.size === 0) { showMessage("Por favor, selecciona al menos una venta.", "info"); return; }
        setIsPrinting(true);
        try {
            const shipmentIds = Array.from(selectedOrders).map(id => salesOrders.find(o => o.id === id)?.shipping_id).filter(Boolean);
            if (shipmentIds.length === 0) throw new Error("No se encontraron IDs de envío válidos.");

            // --- CAMBIO CLAVE: Usamos supabase.functions.invoke ---
            const { data, error } = await supabase.functions.invoke('get-ml-labels', {
                body: {
                    shipment_ids: shipmentIds.join(','),
                    format: format
                },
                // Importante: Indicamos que esperamos una respuesta binaria (Blob)
                responseType: 'blob'
            });

            // Manejo de errores robusto
            if (error) {
                console.error("Error recibido de Edge Function:", error);
                let errorMessage = error.message || 'Error desconocido al llamar a la función.';
                
                // Si la función devolvió un error (ej. status 500), el cuerpo de la respuesta 
                // también será un Blob/ArrayBuffer. Intentamos decodificarlo para obtener el mensaje JSON.
                if (error.context && error.context.body) {
                    try {
                        // Decodificamos el cuerpo binario a texto
                        const errorText = new TextDecoder().decode(error.context.body);
                        const errorBody = JSON.parse(errorText);
                        errorMessage = errorBody.error || errorMessage;
                    } catch (e) {
                        // Si falla el parseo (no era JSON válido), usamos el mensaje genérico
                    }
                }
                throw new Error(errorMessage);
            }

            // 'data' ya es el Blob.
            const blob = data;

            // Verifica si el Blob está vacío (Evita el error de createObjectURL)
            if (!blob || blob.size === 0) {
                throw new Error("El archivo recibido está vacío (Blob size 0). Verifica los logs de Supabase.");
            }
            
            // Descarga
            const fileName = `etiquetas-${Date.now()}.${format}`;
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            
        } catch (err) {
            console.error("Error al generar etiquetas:", err);
            showMessage(`Error al generar etiquetas: ${err.message}`, 'error');
        } finally {
            setIsPrinting(false);
        }
    };
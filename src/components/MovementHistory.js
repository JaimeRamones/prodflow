import React, { useState, useEffect, useContext } from 'react';
import { collection, query, orderBy, getDocs, limit } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { AppContext } from '../App';

// Componente final con el nuevo tema oscuro aplicado.
const MovementHistory = () => {
    const { showMessage } = useContext(AppContext);
    const [movements, setMovements] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchMovements = async () => {
            setLoading(true);
            try {
                const movementsRef = collection(db, 'movements');
                const q = query(movementsRef, orderBy('timestamp', 'desc'), limit(100));
                const querySnapshot = await getDocs(q);
                const movementsData = querySnapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        ...data,
                        timestamp: data.timestamp ? data.timestamp.toDate() : new Date()
                    };
                });
                setMovements(movementsData);
            } catch (error) {
                showMessage(`Error al cargar el historial: ${error.message}`, 'error');
            } finally {
                setLoading(false);
            }
        };
        fetchMovements();
    }, [showMessage]);

    const getTypeChip = (type) => {
        if (type === 'entrada' || type === 'ajuste_positivo' || type === 'devolucion') {
            return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-900/50 text-green-300">Entrada</span>;
        }
        if (type === 'venta' || type === 'ajuste_negativo') {
            return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-900/50 text-red-300">Salida</span>;
        }
        return <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-700 text-gray-300">{type}</span>;
    };

    return (
        <div>
            <h2 className="text-3xl font-bold text-white mb-6">Historial de Movimientos</h2>
            <div className="relative overflow-x-auto shadow-md sm:rounded-lg">
                {/* --- INICIO DE CORRECCIÓN --- */}
                <table className="w-full text-sm text-left text-gray-400 table-fixed">
                {/* --- FIN DE CORRECCIÓN --- */}
                    <thead className="text-xs text-gray-300 uppercase bg-gray-700">
                        <tr>
                            <th scope="col" className="px-6 py-3 w-1/4">Fecha y Hora</th>
                            <th scope="col" className="px-6 py-3 w-1/4">SKU</th>
                            <th scope="col" className="px-6 py-3">Tipo</th>
                            <th scope="col" className="px-6 py-3">Descripción</th>
                            <th scope="col" className="px-6 py-3 text-right">Cantidad</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {loading ? (
                            <tr className="bg-gray-800"><td colSpan="5" className="text-center py-4 text-gray-400">Cargando historial...</td></tr>
                        ) : movements.map(mov => (
                            <tr key={mov.id} className="bg-gray-800 hover:bg-gray-700/50">
                                <td className="px-6 py-4">{mov.timestamp.toLocaleString('es-AR')}</td>
                                <td className="px-6 py-4 font-medium text-white whitespace-nowrap">{mov.sku}</td>
                                <td className="px-6 py-4">{getTypeChip(mov.type)}</td>
                                <td className="px-6 py-4">{mov.description || 'N/A'}</td>
                                <td className={`px-6 py-4 text-right font-bold ${mov.quantity > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {mov.quantity > 0 ? `+${mov.quantity}` : mov.quantity}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default MovementHistory;

// Ruta: src/components/PublicationGenerator.js
import React, { useState } from 'react';

const PublicationGenerator = () => {
    // --- SIMULACIÓN DE DATOS (MÁS ADELANTE SE REEMPLAZARÁ CON DATOS REALES) ---
    const supplierData = [
        { sku: 'VMG-BA456', name: 'Bomba de Agua', brand: 'VMG', applications: 'VW Gol Trend 1.6; VW Suran 1.6; VW Fox 1.6', category_hint: 'Bombas de Agua' },
        { sku: 'FREMAX-BD478', name: 'Disco de Freno', brand: 'Fremax', applications: 'Ford Focus 2.0 2017; Ford Focus 2.0 2018', category_hint: 'Discos de Freno' },
        { sku: 'DAYCO-117SP', name: 'Correa Sincrónica', brand: 'Dayco', applications: 'Ford Fiesta 1.4 16V Zetec 1996; Ford Courier 1.4 16V Zetec 1998', category_hint: 'Correas de Distribución' },
        { sku: 'MAHLE-BOB01', name: 'Bobina De Encendido', brand: 'Mahle', applications: 'Toyota Etios 1.5 2016; Toyota Yaris 1.5 2017', category_hint: 'Bobinas de Encendido'}
    ];

    const meliVehicleDB = [
        { productId: 'MLA12345', brand: 'Volkswagen', model: 'Gol Trend', year: '2014', engine: '1.6 8v MSI'},
        { productId: 'MLA12346', brand: 'Volkswagen', model: 'Suran', year: '2015', engine: '1.6 8v MSI'},
        { productId: 'MLA12347', brand: 'Volkswagen', model: 'Fox', year: '2013', engine: '1.6 8v MSI'},
        { productId: 'MLA56789', brand: 'Ford', model: 'Focus', year: '2017', engine: '2.0 Duratec'},
        { productId: 'MLA56790', brand: 'Ford', model: 'Focus', year: '2018', engine: '2.0 Duratec'},
        { productId: 'MLA65432', brand: 'Ford', model: 'Fiesta', year: '1996', engine: '1.4 16V Zetec'},
        { productId: 'MLA65433', brand: 'Ford', model: 'Courier', year: '1998', engine: '1.4 16V Zetec'},
        { productId: 'MLA77788', brand: 'Toyota', model: 'Etios', year: '2016', engine: '1.5 16v'},
        { productId: 'MLA77799', brand: 'Toyota', model: 'Yaris', year: '2017', engine: '1.5 16v'}
    ];

    const [currentStep, setCurrentStep] = useState(1);
    const [processingStatus, setProcessingStatus] = useState('Analizando productos...');
    const [generatedPublications, setGeneratedPublications] = useState([]);
    const [includeBrandInTitle, setIncludeBrandInTitle] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [publicationToEdit, setPublicationToEdit] = useState(null);


    const handleLoadSampleData = () => {
        setCurrentStep(2);
        processData(supplierData);
    };

    const generateTitle = (productName, productBrand, models, includeBrand) => {
        let title = includeBrand ? `${productName} ${productBrand}` : productName;
        const modelsString = Array.from(models).join(' ');
        title += ` ${modelsString}`;
        return title.length > 60 ? title.substring(0, 57) + '...' : title;
    };

    const generateDescription = (product, compatibilities) => {
        let desc = `Características:\n`;
        desc += `Condición del ítem: Nuevo\n`;
        desc += `Marca: ${product.brand}\n`;
        desc += `Número de pieza: ${product.sku}\n`;
        desc += `Tipo de vehículo: Auto/Camioneta\n\n`;
        desc += `Vehículos (aplicaciones):\n\n`;
        compatibilities.forEach(comp => {
            desc += `${comp.brand.toUpperCase()} ${comp.model.toUpperCase()} ${comp.engine} ${comp.year}\n`;
        });
        return desc;
    };

    const processData = async (data) => {
        let publications = [];
        for (let i = 0; i < data.length; i++) {
            const item = data[i];
            setProcessingStatus(`(${i + 1}/${data.length}) Buscando compatibilidades para SKU ${item.sku}...`);
            await new Promise(resolve => setTimeout(resolve, 500)); // Simula demora de API

            const applications = item.applications.split(';').map(s => s.trim());
            let foundCompatibilities = [];
            let compatibleModels = new Set();
            applications.forEach(appString => {
                const match = meliVehicleDB.find(v =>
                    appString.toLowerCase().includes(v.brand.toLowerCase()) &&
                    appString.toLowerCase().includes(v.model.toLowerCase())
                );
                if (match) {
                    foundCompatibilities.push(match);
                    compatibleModels.add(match.model);
                }
            });

            const title = generateTitle(item.name, item.brand, compatibleModels, includeBrandInTitle);
            const description = generateDescription(item, foundCompatibilities);

            publications.push({
                sku: item.sku,
                title: title,
                description: description,
                category: item.category_hint,
                compatibilities: foundCompatibilities,
            });
        }
        setGeneratedPublications(publications);
        setCurrentStep(3);
    };
    
    const openEditModal = (pub) => {
        setPublicationToEdit(pub);
        setIsModalOpen(true);
    };
    
    const handleSaveModal = () => {
        // Aquí iría la lógica para guardar los cambios de la publicación editada
        setIsModalOpen(false);
        setPublicationToEdit(null);
    }

    return (
        <div className="text-white">
            <header className="text-center mb-8">
                <h1 className="text-4xl font-bold text-cyan-400">Módulo de Generación Inteligente</h1>
                <p className="text-gray-400 mt-2">Transforma catálogos de proveedores en publicaciones de Mercado Libre.</p>
            </header>

            <main id="app-container">
                {/* Paso 1: Carga y Configuración */}
                <div id="step-1-upload" className={`step-card bg-gray-800 p-8 rounded-xl shadow-2xl ${currentStep === 1 ? 'visible-step' : 'hidden-step'}`}>
                    <div className="flex items-center mb-6">
                        <div className="bg-cyan-500 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg mr-4">1</div>
                        <h2 className="text-2xl font-semibold">Cargar Catálogo y Configurar</h2>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center flex flex-col justify-center">
                            <p className="mb-4 text-gray-400">Sube el archivo CSV de tu proveedor.</p>
                            <button onClick={handleLoadSampleData} className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-3 px-6 rounded-lg transition duration-300">
                                Usar Datos de Ejemplo (Simulación)
                            </button>
                            <input type="file" id="file-upload" className="hidden" accept=".csv" />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold mb-4">Opciones de Generación</h3>
                            <div className="bg-gray-700 p-4 rounded-lg">
                                <div className="flex items-center justify-between">
                                    <label htmlFor="include-brand-toggle" className="text-gray-300">Incluir marca de la pieza en el título</label>
                                    <div className="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
                                        <input type="checkbox" name="toggle" id="include-brand-toggle" checked={includeBrandInTitle} onChange={() => setIncludeBrandInTitle(!includeBrandInTitle)} className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"/>
                                        <label htmlFor="include-brand-toggle" className="toggle-label block overflow-hidden h-6 rounded-full bg-gray-600 cursor-pointer"></label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Paso 2: Procesamiento */}
                <div id="step-2-processing" className={`step-card bg-gray-800 p-8 rounded-xl shadow-2xl text-center ${currentStep === 2 ? 'visible-step' : 'hidden-step'}`}>
                    <div className="flex items-center mb-6 w-max mx-auto">
                        <div className="bg-cyan-500 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg mr-4">2</div>
                        <h2 className="text-2xl font-semibold">Procesando Datos</h2>
                    </div>
                    <div className="flex justify-center items-center my-8"><div className="loader"></div></div>
                    <p id="processing-status" className="text-gray-400">{processingStatus}</p>
                </div>
                
                {/* Paso 3: Revisión y Publicación */}
                <div id="step-3-review" className={`step-card bg-gray-800 p-8 rounded-xl shadow-2xl ${currentStep === 3 ? 'visible-step' : 'hidden-step'}`}>
                    <div className="flex flex-col sm:flex-row items-center justify-between mb-6 gap-4">
                        <div className="flex items-center">
                            <div className="bg-cyan-500 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg mr-4">3</div>
                            <h2 className="text-2xl font-semibold">Revisar y Subir Publicaciones</h2>
                        </div>
                        <div>
                            <button onClick={() => setCurrentStep(1)} className="text-sm text-cyan-400 hover:underline mr-4">Cargar otro archivo</button>
                            <button className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-5 rounded-lg transition duration-300">
                                Subir todo a Mercado Libre
                            </button>
                        </div>
                    </div>
                    <div className="bg-gray-900 rounded-lg overflow-x-auto">
                        <table className="table-auto w-full text-sm">
                            <thead className="bg-gray-700">
                                <tr>
                                    <th className="p-3 text-left">SKU</th>
                                    <th className="p-3 text-left">Título Generado</th>
                                    <th className="p-3 text-left">Categoría (Predicción)</th>
                                    <th className="p-3 text-left">Compatibilidades</th>
                                    <th className="p-3 text-left">Estado</th>
                                    <th className="p-3 text-left">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {generatedPublications.map((pub, index) => (
                                    <tr key={pub.sku} className="border-b border-gray-700 hover:bg-gray-700/50">
                                        <td className="p-3 font-mono text-cyan-400">{pub.sku}</td>
                                        <td className="p-3">{pub.title}</td>
                                        <td className="p-3">{pub.category}</td>
                                        <td className="p-3 text-center">{pub.compatibilities.length}</td>
                                        <td className="p-3"><span className="bg-green-500 text-green-900 text-xs font-semibold px-2.5 py-0.5 rounded-full">Generado</span></td>
                                        <td className="p-3"><button onClick={() => openEditModal(pub)} className="text-blue-400 hover:underline text-xs">Ver/Editar</button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>

            {/* Modal para Previsualización y Edición */}
            {isModalOpen && publicationToEdit && (
                 <div className="modal fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4">
                    <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-gray-700 flex justify-between items-center">
                            <h3 className="text-xl font-semibold">Previsualizar / Editar Publicación</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white text-3xl">&times;</button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-400">Título</label>
                                <input type="text" defaultValue={publicationToEdit.title} className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 mt-1" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400">SKU</label>
                                <input type="text" value={publicationToEdit.sku} className="w-full bg-gray-600 border border-gray-500 rounded-lg p-2 mt-1" disabled />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400">Descripción</label>
                                <textarea defaultValue={publicationToEdit.description} rows="10" className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 mt-1"></textarea>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400">Imágenes</label>
                                <div className="mt-1 p-4 border-2 border-dashed border-gray-600 rounded-lg text-center">
                                    <p className="text-sm text-gray-500">Área para cargar imágenes del producto.</p>
                                </div>
                            </div>
                        </div>
                        <div className="p-6 bg-gray-800/50 border-t border-gray-700 text-right">
                            <button onClick={handleSaveModal} className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-5 rounded-lg transition">Guardar Cambios</button>
                        </div>
                    </div>
                </div>
            )}
             <style jsx>{`
                .toggle-checkbox:checked { right: 0; border-color: #059669; }
                .toggle-checkbox:checked + .toggle-label { background-color: #059669; }
            `}</style>
        </div>
    );
};

export default PublicationGenerator;

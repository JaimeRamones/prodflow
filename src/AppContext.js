// src/AppContext.js

import React, { useState, useEffect, createContext, useCallback } from 'react';
import { supabase } from './supabaseClient';

export const AppContext = createContext();

export const AppProvider = ({ children }) => {
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [products, setProducts] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [categories, setCategories] = useState([]);
    const [kits, setKits] = useState([]);
    const [salesOrders, setSalesOrders] = useState([]);
    const [supplierOrders, setSupplierOrders] = useState([]);
    const [purchaseOrders, setPurchaseOrders] = useState([]);
    const [notification, setNotification] = useState({ show: false, message: '', type: '' });

    const showMessage = (message, type = 'info') => {
        setNotification({ show: true, message, type });
    };

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setLoading(false);
        });
        const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        });
        return () => {
            if (authListener && authListener.subscription) {
                authListener.subscription.unsubscribe();
            }
        };
    }, []);
    
    const fetchProducts = useCallback(async () => {
        const { data, error } = await supabase.from('products').select('*').order('created_at', { ascending: false });
        if (error) { showMessage('Error al refrescar los productos.', 'error'); } 
        else { setProducts(data || []); }
    }, []);

    const fetchSuppliers = useCallback(async () => {
        const { data, error } = await supabase.from('suppliers').select('*').order('name', { ascending: true });
        if (error) { showMessage('Error al refrescar los proveedores.', 'error'); }
        else { setSuppliers(data || []); }
    }, []);

    const fetchCategories = useCallback(async () => {
        const { data, error } = await supabase.from('categories').select('*').order('name', { ascending: true });
        if (error) { showMessage('Error al refrescar las categorías.', 'error'); }
        else { setCategories(data || []); }
    }, []);

    const fetchSalesOrders = useCallback(async () => {
        if (!session?.user?.id) return;
        const { data, error } = await supabase.from('sales_orders').select(`*, order_items ( * )`).eq('user_id', session.user.id).order('created_at', { ascending: false });
        if (error) { showMessage('Error al cargar pedidos de venta.', 'error'); } 
        else { setSalesOrders(data || []); }
    }, [session]);

    const fetchSupplierOrders = useCallback(async () => {
        const { data, error } = await supabase.from('supplier_orders').select(`*`).order('created_at', { ascending: false });
        if (error) { showMessage('Error al cargar pedidos a proveedor.', 'error'); } 
        else { setSupplierOrders(data || []); }
    }, []);

    const fetchPurchaseOrders = useCallback(async () => {
        const { data, error } = await supabase.from('purchase_orders').select(`*`).order('created_at', { ascending: false });
        if (error) { showMessage('Error al cargar órdenes de compra.', 'error'); } 
        else { setPurchaseOrders(data || []); }
    }, []);

    const fetchKits = useCallback(async () => {
        const { data, error } = await supabase.from('kits').select(`*, components:kit_components(*)`).order('name', { ascending: true });
        if (error) showMessage('Error al cargar los kits.', 'error'); 
        else setKits(data || []);
    }, []);

    useEffect(() => {
        if (session) {
            Promise.all([
                fetchProducts(),
                fetchSuppliers(),
                fetchCategories(),
                fetchSalesOrders(),
                fetchSupplierOrders(),
                fetchPurchaseOrders(),
            ]);
        }
    }, [session, fetchProducts, fetchSuppliers, fetchCategories, fetchSalesOrders, fetchSupplierOrders, fetchPurchaseOrders, fetchKits]);
    
    const value = { 
        session, loading, showMessage, 
        products, suppliers, categories, kits, salesOrders, supplierOrders, purchaseOrders,
        notification, setNotification, 
        fetchProducts, fetchSuppliers, fetchCategories, fetchKits, fetchSalesOrders, fetchSupplierOrders, fetchPurchaseOrders 
    };
    
    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
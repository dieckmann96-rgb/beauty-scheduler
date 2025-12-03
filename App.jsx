import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, collection, query, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { Calendar, Users, ListChecks, DollarSign, Loader2, ArrowLeft, Menu, X, Clock, Zap, AlertTriangle, Phone, Hand, Scissors, Eye, Gift, CheckCircle, Grip, Clock8 } from 'lucide-react';

// Variáveis globais fornecidas pelo ambiente Canvas (MANTIDAS POR SEGURANÇA NO AMBIENTE ONDE RODAM)
// EM UM AMBIENTE DE PRODUÇÃO REAL (Vercel), VOCÊ USARIA VARIÁVEIS DE AMBIENTE (ENV VARS) AQUI.
// COMO NÃO TEMOS AS VARIAVEIS REAIS DO SEU PROJETO FIREBASE, ESTA ESTRUTURA É NECESSÁRIA PARA FUNCIONAR
// NO CONTEXTO DO NOSSO AMBIENTE DE COMPILAÇÃO.
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// CONSTANTE DO ESTÚDIO: Número de WhatsApp para Confirmação (Paraguai)
const STUDIO_WHATSAPP_NUMBER = '595982644359'; // +595 982 644359

// Configurações e Utilitários
// Moeda e Local: Guarani (PYG) - Paraguai
const CURRENCY_SYMBOL = 'Gs.';
const LOCALE = 'es-PY'; // Locale para formatação numérica e de moeda

const formatPrice = (price) => {
    return `${CURRENCY_SYMBOL} ${price.toLocaleString(LOCALE)}`;
};

// Estrutura de Serviços Detalhada
const SERVICES = [
    { 
        name: "Manicure e Pedicure", 
        category: "Mãos e Pés",
        icon: Hand,
        options: [
            { id: "mp-normal", name: "Normal", price: 50000, duration: 60 },
            { id: "mp-semi", name: "Semi Permanente", price: 70000, duration: 90 },
        ]
    },
    { 
        name: "Extensão de Cílios", 
        category: "Olhos",
        icon: Eye,
        options: [
            { id: "ec-leve", name: "Carga Leve", price: 150000, duration: 120 },
            { id: "ec-medio", name: "Carga Mediana", price: 180000, duration: 150 },
            { id: "ec-total", name: "Carga Total", price: 250000, duration: 180 },
        ]
    },
    { 
        name: "Design de Sobrancelhas", 
        category: "Rosto",
        icon: Eye,
        options: [
            { id: "ds-henna", name: "Com Henna", price: 50000, duration: 60 },
            { id: "ds-tinta", name: "Com Tinta", price: 60000, duration: 60 },
        ]
    },
    { 
        name: "Maquiagem Profissional", 
        category: "Rosto",
        icon: Gift,
        options: [
            { id: "mp-com", name: "Com Cílios Postiços", price: 150000, duration: 90 },
            { id: "mp-sem", name: "Sem Cílios Postiços", price: 100000, duration: 60 },
        ]
    },
    { 
        name: "Penteados", 
        category: "Cabelo",
        icon: Scissors,
        options: [
            { id: "p-padrao", name: "Penteado Padrão", price: 50000, duration: 90 },
        ]
    },
    { 
        name: "Tratamento Capilar", 
        category: "Cabelo",
        icon: Scissors,
        options: [
            { id: "tc-lavagem", name: "Lavagem e Secado", price: 50000, duration: 60 },
            { id: "tc-hidratacao", name: "Com Hidratação", price: 80000, duration: 90 },
        ]
    },
    { 
        name: "Laminado de Cílios", 
        category: "Olhos",
        icon: Eye,
        options: [
            { id: "lc-padrao", name: "Laminado de Cílios", price: 150000, duration: 90 },
        ]
    },
    { 
        name: "Lifting de Pestañas", 
        category: "Olhos",
        icon: Eye,
        options: [
            { id: "lp-padrao", name: "Lifting de Pestañas", price: 100000, duration: 90 },
        ]
    },
];

const TIME_SLOT_INTERVAL = 30; // minutos

const generateTimeSlots = (date) => {
    const dayOfWeek = date.getDay(); // 0 (Domingo) a 6 (Sábado)
    let startHour, endHour;

    // Segunda (1) a Sexta (5): 15:00 - 22:00
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        startHour = 15;
        endHour = 22;
    } 
    // Sábado (6) e Domingo (0): 09:00 - 22:00
    else if (dayOfWeek === 0 || dayOfWeek === 6) {
        startHour = 9;
        endHour = 22;
    } else {
        return [];
    }

    const slots = [];
    let currentTime = new Date(date);
    currentTime.setHours(startHour, 0, 0, 0);

    const endTime = new Date(date);
    endTime.setHours(endHour, 0, 0, 0);

    while (currentTime < endTime) {
        const hour = currentTime.getHours().toString().padStart(2, '0');
        const minute = currentTime.getMinutes().toString().padStart(2, '0');
        slots.push(`${hour}:${minute}`);
        currentTime.setTime(currentTime.getTime() + TIME_SLOT_INTERVAL * 60 * 1000);
    }

    return slots;
};

// Funções de Coleção do Firestore
const getPublicAppointmentsCollection = (db) => collection(db, 'artifacts', appId, 'public', 'data', 'appointments');
const getPrivateClientsCollection = (db, userId) => collection(db, 'artifacts', appId, 'users', userId, 'clients');

const LoadingSpinner = () => (
    <div className="flex justify-center items-center py-8">
        <Loader2 className="w-8 h-8 animate-spin text-pink-500" />
        <span className="ml-3 text-gray-600">Carregando dados...</span>
    </div>
);

const ErrorMessage = ({ message }) => (
    <div className="p-4 bg-red-100 border-l-4 border-red-500 text-red-700 rounded-md my-4 flex items-center">
        <AlertTriangle className="w-5 h-5 mr-3" />
        {message}
    </div>
);


// --- Componente Modal Genérico para Seleção ---
const SelectionModal = ({ title, children, isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div 
                className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto transform transition-all duration-300 scale-100" 
                onClick={(e) => e.stopPropagation()} // Previne fechar ao clicar dentro
            >
                <div className="sticky top-0 bg-pink-50 p-4 border-b border-pink-200 flex justify-between items-center rounded-t-xl">
                    <h2 className="text-xl font-bold text-pink-700">{title}</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-pink-100 text-pink-600">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                <div className="p-6">
                    {children}
                </div>
            </div>
        </div>
    );
};

// --- Componente de Detalhes do Cliente e Confirmação (AGORA COMPONENTE SEPARADO E MEMOIZADO) ---
const ClientDetailsForm = React.memo(({
    currentServiceOption, selectedDate, selectedTime,
    clientName, setClientName, clientPhone, setClientPhone,
    handleBooking, isLoading, setActiveStep, statusMessage, userId
}) => {
    
    // Converte a data selecionada para um formato amigável para o resumo
    const formattedDate = useMemo(() => {
        if (!selectedDate) return '';
        return new Date(selectedDate + 'T00:00:00').toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
    }, [selectedDate]);

    return (
        <form onSubmit={handleBooking} className="space-y-6">
            <h2 className="text-2xl font-bold text-pink-600 mb-4 border-b pb-2 flex items-center"><Zap className="w-6 h-6 mr-2"/> Confirmar Agendamento</h2>
            <div className="p-5 border rounded-xl bg-white shadow-lg space-y-4">
                 {/* Resumo do Pedido */}
                {currentServiceOption && (
                    <div className="p-4 bg-pink-50 border-l-4 border-pink-400 rounded-lg shadow-inner mb-4">
                        <p className="text-sm font-medium text-pink-700">Resumo do Agendamento:</p>
                        <p className="text-xl font-bold text-gray-800">
                            {currentServiceOption.serviceName} - {currentServiceOption.optionName}
                        </p>
                        <p className="text-md font-semibold text-gray-700">
                            <Calendar className="w-4 h-4 inline mr-1 text-pink-500"/> {formattedDate} às {selectedTime}
                        </p>
                        <p className="text-lg font-semibold text-green-700 mt-1 flex items-center">
                            <DollarSign className="w-4 h-4 mr-1"/> Valor: {formatPrice(currentServiceOption.price)}
                        </p>
                    </div>
                )}
                <h4 className="text-lg font-semibold text-gray-700 flex items-center"><Users className="w-5 h-5 mr-2" /> Informações de Contato</h4>
                <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                    <input
                        type="text"
                        id="name"
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-pink-500 focus:border-pink-500 transition duration-150"
                        value={clientName}
                        // O onChange está estável e atualiza o estado do componente pai, mas o memo garante que este componente só re-renderize se as props mudarem.
                        onChange={(e) => setClientName(e.target.value)} 
                        placeholder="Seu nome"
                        required
                    />
                </div>
                <div>
                    <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">Telefone (WhatsApp com DDD - Ex: 981xxxxxx)</label>
                    <input
                        type="tel" // Use type="tel" para melhor experiência em mobile
                        id="phone"
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-pink-500 focus:border-pink-500 transition duration-150"
                        value={clientPhone}
                        onChange={(e) => setClientPhone(e.target.value)}
                        placeholder="Ex: 981555123"
                        required
                    />
                    <p className="text-xs text-gray-500 mt-1">Seu número é essencial para o estúdio entrar em contato para a confirmação.</p>
                </div>
            </div>
            
            {statusMessage && statusMessage.type === 'error' && <ErrorMessage message={statusMessage.text} />}

            <div className="flex justify-between">
                <button
                    type="button"
                    onClick={() => setActiveStep(0)} // Volta para a tela principal de seleção
                    className="px-6 py-3 bg-gray-300 text-gray-700 font-bold rounded-lg shadow-md hover:bg-gray-400 transition flex items-center"
                >
                    <ArrowLeft className="w-5 h-5 mr-2" /> Voltar
                </button>
                <button
                    type="submit"
                    disabled={isLoading || !clientName || !clientPhone}
                    className="px-6 py-3 flex justify-center items-center border border-transparent rounded-lg shadow-xl text-lg font-bold text-white bg-pink-500 hover:bg-pink-600 focus:outline-none focus:ring-4 focus:ring-pink-300 transition duration-200 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    {isLoading ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Zap className="w-5 h-5 mr-2" />}
                    Confirmar e Agendar
                </button>
            </div>
        </form>
    );
});


// --- Componente de Agendamento Modular (Client-Facing) ---
const ClientScheduler = ({ db, userId, allAppointments }) => {
    const today = useMemo(() => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }, []);
    const todayString = useMemo(() => today.toISOString().split('T')[0], [today]);

    // Estados do Agendamento
    const [activeStep, setActiveStep] = useState(0); // 0: Main, 1: Service, 2: Date, 3: Time, 4: Details, 5: Conclusion
    const [selectedServiceId, setSelectedServiceId] = useState(null);
    const [selectedDate, setSelectedDate] = useState(todayString);
    const [selectedTime, setSelectedTime] = useState('');
    const [clientName, setClientName] = useState('');
    const [clientPhone, setClientPhone] = useState('');
    const [statusMessage, setStatusMessage] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    // Obtém o serviço e a opção selecionada
    const currentServiceOption = useMemo(() => {
        for (const service of SERVICES) {
            const option = service.options.find(opt => opt.id === selectedServiceId);
            if (option) {
                return { 
                    serviceName: service.name,
                    optionName: option.name,
                    price: option.price,
                    duration: option.duration
                };
            }
        }
        return null;
    }, [selectedServiceId]);

    // Lista de horários disponíveis para a data e serviço selecionados
    const availableSlots = useMemo(() => {
        if (!selectedDate) return [];

        const dateObj = new Date(selectedDate + 'T00:00:00');
        
        // Verifica se a data é passada (e não é o dia atual)
        if (dateObj < today && selectedDate !== todayString) {
            return [];
        }

        const slots = generateTimeSlots(dateObj);
        
        const bookedTimes = allAppointments
            .filter(app => {
                const appDate = app.date.toDate().toISOString().split('T')[0];
                return appDate === selectedDate;
            })
            .map(app => app.time);

        return slots.filter(slot => !bookedTimes.includes(slot));
    }, [selectedDate, allAppointments, today, todayString]);

    // Função de Booking Final
    const handleBooking = useCallback(async (e) => {
        e.preventDefault();
        if (!selectedTime || !clientName || !clientPhone || !currentServiceOption) {
            setStatusMessage({ type: 'error', text: 'Por favor, preencha todos os campos e selecione um horário.' });
            return;
        }

        setIsLoading(true);
        setStatusMessage(null);

        const appointmentDate = new Date(selectedDate + 'T' + selectedTime + ':00');
        const formattedDate = appointmentDate.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
        
        // --- LÓGICA ATUALIZADA DO WHATSAPP ---
        const whatsAppMessage = encodeURIComponent(
            `Olá! Sou ${clientName} (Telefone: ${clientPhone}) e gostaria de CONFIRMAR o seguinte agendamento:\n\n` +
            `*Serviço:* ${currentServiceOption.serviceName} - ${currentServiceOption.optionName}\n` +
            `*Data/Hora:* ${formattedDate} às ${selectedTime}\n` +
            `*Valor:* ${formatPrice(currentServiceOption.price)}\n\n` +
            `Por favor, confirme a disponibilidade e o agendamento. Obrigada!`
        );
        
        // O link usa o número FIXO do estúdio (STUDIO_WHATSAPP_NUMBER)
        const whatsAppLink = `https://wa.me/${STUDIO_WHATSAPP_NUMBER}?text=${whatsAppMessage}`;

        try {
            // 1. Salvar Agendamento (Public)
            await addDoc(getPublicAppointmentsCollection(db), {
                date: appointmentDate,
                time: selectedTime,
                service: currentServiceOption.serviceName,
                serviceOption: currentServiceOption.optionName,
                price: currentServiceOption.price,
                duration: currentServiceOption.duration,
                clientName: clientName,
                clientPhone: clientPhone, 
                status: 'Aguardando',
                bookedAt: serverTimestamp(),
                userId: userId, 
            });

            // 2. Salvar Cliente (Private) - Usa o telefone como ID do cliente
            const clientDocRef = doc(getPrivateClientsCollection(db, userId), clientPhone);
            await setDoc(clientDocRef, {
                name: clientName,
                phone: clientPhone,
                lastAppointment: serverTimestamp(),
            }, { merge: true });
            
            setStatusMessage({ 
                type: 'success', 
                text: `Agendamento realizado! Você será redirecionado para o WhatsApp para confirmar com o estúdio.`,
                whatsAppLink: whatsAppLink
            });
            setActiveStep(5); // Passo de Conclusão

        } catch (error) {
            console.error("Erro ao agendar:", error);
            setStatusMessage({ type: 'error', text: 'Houve um erro ao tentar agendar. Tente novamente.' });
            setIsLoading(false);
        }
    }, [db, userId, selectedTime, clientName, clientPhone, currentServiceOption, selectedDate]);


    // --- Componentes Modulares de Seleção ---
    
    // Módulo 1: Seleção de Serviço
    const StepService = () => (
        <div className="space-y-4">
            {SERVICES.map((service) => (
                <div key={service.name} className="p-3 border border-gray-200 rounded-lg bg-gray-50 shadow-sm">
                    <h4 className="flex items-center text-lg font-bold text-pink-700 mb-2 border-b pb-1">
                        <service.icon className="w-5 h-5 mr-2 text-pink-500" />
                        {service.name}
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {service.options.map(option => (
                            <button
                                key={option.id}
                                type="button"
                                onClick={() => {
                                    setSelectedServiceId(option.id);
                                    setActiveStep(0); // Volta para a página principal
                                }}
                                className={`p-3 text-sm font-medium rounded-lg transition text-left border ${
                                    selectedServiceId === option.id 
                                        ? 'bg-pink-500 text-white border-pink-500 shadow-md transform scale-[1.02]' 
                                        : 'bg-white text-gray-700 border-gray-300 hover:bg-pink-100'
                                }`}
                            >
                                <span className="font-bold block">{option.name}</span>
                                <span className="text-xs">{formatPrice(option.price)} ({option.duration} min)</span>
                            </button>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
    
    // Módulo 2: Seleção de Data
    const StepDate = () => (
        <div className="space-y-4">
            <h4 className="text-lg font-semibold text-gray-700 flex items-center"><Calendar className="w-5 h-5 mr-2" /> Calendário Nativo</h4>
            <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                    setSelectedDate(e.target.value);
                    setSelectedTime(''); // Resetar horário ao mudar a data
                }}
                min={todayString}
                className="w-full p-4 border-2 border-pink-400 rounded-lg text-xl font-bold focus:ring-pink-500 focus:border-pink-500 transition duration-150 shadow-md"
            />
            <p className="text-center text-sm text-pink-600 font-medium mt-3">
                {new Date(selectedDate + 'T00:00:00').getDay() >= 1 && new Date(selectedDate + 'T00:00:00').getDay() <= 5 ? 'Horário: 15:00 às 22:00 (Seg-Sex)' : 'Horário: 09:00 às 22:00 (Sáb-Dom)'}
            </p>
            <div className="flex justify-end pt-4">
                <button
                    onClick={() => selectedDate && setActiveStep(0)}
                    disabled={!selectedDate}
                    className="px-6 py-3 bg-pink-500 text-white font-bold rounded-lg shadow-md hover:bg-pink-600 disabled:bg-gray-400 transition"
                >
                    Confirmar Data
                </button>
            </div>
        </div>
    );

    // Módulo 3: Seleção de Horário
    const StepTime = () => (
        <div className="space-y-4">
            <h4 className="text-center text-xl font-bold text-pink-700 mb-4">{new Date(selectedDate + 'T00:00:00').toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' })}</h4>
            {selectedDate && availableSlots.length > 0 && <p className="text-sm text-gray-600 mb-3 font-medium">Selecione um dos horários disponíveis:</p>}
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-64 overflow-y-auto p-2 border rounded-lg bg-gray-50">
                {availableSlots.length > 0 ? (
                    availableSlots.map(slot => (
                        <button
                            key={slot}
                            type="button"
                            onClick={() => {
                                setSelectedTime(slot);
                                setActiveStep(0); // Volta para a página principal
                            }}
                            className={`p-3 text-base font-medium rounded-xl transition ${
                                selectedTime === slot 
                                    ? 'bg-pink-500 text-white shadow-lg ring-2 ring-pink-300' 
                                    : 'bg-white text-pink-600 border border-pink-300 hover:bg-pink-100'
                            }`}
                        >
                            {slot}
                        </button>
                    ))
                ) : (
                    <p className="col-span-4 text-center text-gray-500 py-3">Nenhum horário disponível para esta data ou a data é passada.</p>
                )}
            </div>
        </div>
    );

    
    // Módulo 5: Conclusão
    const StepConclusion = () => (
        <div className="text-center p-8 border-4 border-green-400 bg-green-50 rounded-xl shadow-2xl space-y-6">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
            <h2 className="text-3xl font-extrabold text-green-800">Agendamento Enviado!</h2>
            {statusMessage && statusMessage.whatsAppLink ? (
                <>
                    <p className="text-lg text-gray-700">Seu pedido foi registrado. Para **finalizar a confirmação** com o estúdio, clique no botão abaixo para ser direcionado ao WhatsApp:</p>
                    <a 
                        href={statusMessage.whatsAppLink} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="mt-4 inline-flex items-center px-8 py-3 border border-transparent text-lg font-medium rounded-xl shadow-lg text-white bg-green-600 hover:bg-green-700 transition transform hover:scale-[1.02] active:scale-[0.98]"
                        onClick={() => console.log("Redirecionando para WhatsApp...")}
                    >
                        <Zap className="w-5 h-5 mr-3" />
                        Ir para Confirmação (WhatsApp)
                    </a>
                    <p className="text-sm text-gray-500 mt-2">O estúdio responderá o mais breve possível no número: {STUDIO_WHATSAPP_NUMBER}</p>
                </>
            ) : (
                <p className="text-lg text-gray-700">Obrigado! Seu agendamento foi processado com sucesso. Aguarde a confirmação.</p>
            )}
            <button
                onClick={() => { setActiveStep(0); setStatusMessage(null); setSelectedServiceId(null); setSelectedTime(''); setClientName(''); setClientPhone(''); }}
                className="mt-6 text-pink-600 hover:text-pink-800 font-semibold flex items-center mx-auto"
            >
                <ArrowLeft className="w-4 h-4 mr-1" /> Fazer Novo Agendamento
            </button>
        </div>
    );
    
    // --- View Principal (activeStep === 0) ---
    const MainSelectionView = () => (
        <div className="space-y-6">
            <h3 className="text-xl font-bold text-gray-700 border-b pb-2 mb-4">1. Escolha suas Opções</h3>

            {/* BOTÕES MODULARES DE SELEÇÃO */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Botão de Serviço */}
                <button
                    onClick={() => { setActiveStep(1); setStatusMessage(null); }}
                    className="flex flex-col items-center justify-center p-5 text-left border-2 border-pink-300 rounded-xl shadow-md bg-white hover:bg-pink-50 transition transform hover:scale-[1.02] active:scale-[0.98] text-pink-600"
                >
                    <Grip className="w-7 h-7 mb-2" />
                    <span className="text-xs font-semibold uppercase text-gray-500">Serviço</span>
                    <span className="font-bold text-lg text-pink-800 text-center mt-1">
                        {currentServiceOption ? currentServiceOption.optionName : 'SELECIONAR'}
                    </span>
                </button>
                
                {/* Botão de Data */}
                <button
                    onClick={() => { setActiveStep(2); setStatusMessage(null); }}
                    className="flex flex-col items-center justify-center p-5 text-left border-2 border-pink-300 rounded-xl shadow-md bg-white hover:bg-pink-50 transition transform hover:scale-[1.02] active:scale-[0.98] text-pink-600"
                >
                    <Calendar className="w-7 h-7 mb-2" />
                    <span className="text-xs font-semibold uppercase text-gray-500">Data</span>
                    <span className="font-bold text-lg text-pink-800 text-center mt-1">
                        {selectedDate ? new Date(selectedDate).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' }) : 'SELECIONAR'}
                    </span>
                </button>
                
                {/* Botão de Horário */}
                <button
                    onClick={() => {
                        if (currentServiceOption && selectedDate) {
                            setActiveStep(3);
                            setStatusMessage(null);
                        } else {
                            setStatusMessage({ type: 'error', text: 'Por favor, selecione o Serviço e a Data antes de escolher o Horário.' });
                        }
                    }}
                    className={`flex flex-col items-center justify-center p-5 text-left border-2 rounded-xl shadow-md transition transform ${
                        currentServiceOption && selectedDate
                        ? 'border-pink-300 bg-white hover:bg-pink-50 hover:scale-[1.02] active:scale-[0.98] text-pink-600'
                        : 'border-gray-300 bg-gray-100 text-gray-500 cursor-not-allowed'
                    }`}
                    disabled={!currentServiceOption || !selectedDate}
                >
                    <Clock8 className="w-7 h-7 mb-2" />
                    <span className="text-xs font-semibold uppercase text-gray-500">Horário</span>
                    <span className="font-bold text-lg text-pink-800 text-center mt-1">
                        {selectedTime || 'SELECIONAR'}
                    </span>
                </button>
            </div>
            
            {statusMessage && statusMessage.type === 'error' && <ErrorMessage message={statusMessage.text} />}

            {/* BOTÃO FINAL PARA DETALHES */}
            <div className="pt-6 border-t border-gray-200">
                <h3 className="text-xl font-bold text-gray-700 mb-4">2. Resumo e Finalização</h3>

                {(selectedServiceId && selectedDate && selectedTime) ? (
                    <button
                        onClick={() => { setActiveStep(4); setStatusMessage(null); }}
                        className="w-full px-6 py-4 flex justify-center items-center border border-transparent rounded-xl shadow-2xl text-xl font-bold text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-4 focus:ring-green-300 transition duration-200 transform hover:scale-[1.01]"
                    >
                        Prosseguir para Detalhes <ArrowLeft className="w-5 h-5 ml-3 transform rotate-180" />
                    </button>
                ) : (
                    <div className="p-4 bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 rounded-md flex items-center justify-center">
                        <AlertTriangle className="w-5 h-5 mr-3" />
                        Selecione o Serviço, Data e Horário para continuar.
                    </div>
                )}
            </div>
        </div>
    );

    const renderMainContent = () => {
        switch (activeStep) {
            case 0: return <MainSelectionView />;
            case 4: return (
                <ClientDetailsForm
                    currentServiceOption={currentServiceOption}
                    selectedDate={selectedDate}
                    selectedTime={selectedTime}
                    clientName={clientName}
                    setClientName={setClientName}
                    clientPhone={clientPhone}
                    setClientPhone={setClientPhone}
                    handleBooking={handleBooking}
                    isLoading={isLoading}
                    setActiveStep={setActiveStep}
                    statusMessage={statusMessage}
                    userId={userId}
                />
            );
            case 5: return <StepConclusion />;
            default: return <MainSelectionView />;
        }
    };
    
    // Configuração do Modal
    let modalTitle = "";
    let modalContent = null;
    
    if (activeStep === 1) {
        modalTitle = "Escolha o Serviço";
        modalContent = <StepService />;
    } else if (activeStep === 2) {
        modalTitle = "Selecione a Data";
        modalContent = <StepDate />;
    } else if (activeStep === 3) {
        modalTitle = "Escolha o Horário";
        modalContent = <StepTime />;
    }

    return (
        <div className="max-w-xl mx-auto p-4 bg-gray-50 rounded-xl shadow-2xl">
            <h2 className="text-3xl font-extrabold text-pink-600 mb-6 text-center">Agendamento Estúdio de Beleza</h2>
            <div className="bg-white p-6 rounded-xl shadow-inner border border-pink-100">
                {renderMainContent()}
            </div>
            
            {/* O Modal de Seleção */}
            <SelectionModal 
                title={modalTitle} 
                isOpen={activeStep >= 1 && activeStep <= 3} 
                onClose={() => setActiveStep(0)}
            >
                {modalContent}
            </SelectionModal>
        </div>
    );
};

// --- Componente de Painel Administrativo (Admin Only) ---
const AdminPanel = ({ userId, db, allAppointments, allClients }) => {
    const [activeTab, setActiveTab] = useState('appointments');
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    
    // Calcula o Resumo Financeiro
    const revenueSummary = useMemo(() => {
        const totalRevenue = allAppointments
            .filter(app => app.status === 'Concluído')
            .reduce((sum, app) => sum + (app.price || 0), 0);
        
        const pendingRevenue = allAppointments
            .filter(app => app.status === 'Confirmado' || app.status === 'Aguardando')
            .reduce((sum, app) => sum + (app.price || 0), 0);

        return {
            totalRevenue: formatPrice(totalRevenue),
            pendingRevenue: formatPrice(pendingRevenue),
            totalAppointments: allAppointments.length,
            completedAppointments: allAppointments.filter(app => app.status === 'Concluído').length,
            pendingAppointments: allAppointments.filter(app => app.status === 'Aguardando').length,
        };
    }, [allAppointments]);

    const AppointmentsList = () => (
        <div className="space-y-4">
            <h3 className="text-2xl font-bold text-pink-600 mb-4 border-b pb-2">Agendamentos (Total: {allAppointments.length})</h3>
            <div className="overflow-x-auto rounded-xl shadow-2xl">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-pink-50 border-b border-pink-200 sticky top-0">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Data/Hora</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Serviço</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Cliente/Telefone</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Valor</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                        {allAppointments
                            .sort((a, b) => a.date.toDate() - b.date.toDate())
                            .map((app) => (
                                <tr key={app.id} className="hover:bg-pink-50 transition duration-150">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {app.date.toDate().toLocaleDateString(LOCALE)} às {app.time}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-700">
                                        <p className="font-semibold">{app.service}</p>
                                        <p className="text-xs text-pink-500">{app.serviceOption}</p>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-700">
                                        {app.clientName}
                                        <p className="text-xs text-gray-500 flex items-center"><Phone className="w-3 h-3 mr-1"/> {app.clientPhone}</p>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-green-700">
                                        {formatPrice(app.price)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full shadow-sm ${
                                            app.status === 'Concluído' ? 'bg-green-200 text-green-900' :
                                            app.status === 'Confirmado' ? 'bg-blue-200 text-blue-900' :
                                            app.status === 'Aguardando' ? 'bg-yellow-200 text-yellow-900' :
                                            'bg-red-200 text-red-900'
                                        }`}>
                                            {app.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                                        {app.status === 'Aguardando' && (
                                            <button 
                                                onClick={() => updateAppointmentStatus(app.id, 'Confirmado')}
                                                className="text-blue-600 hover:text-blue-900 transition text-xs font-bold"
                                                title="Mudar para Confirmado"
                                            >
                                                Confirmar
                                            </button>
                                        )}
                                        {app.status !== 'Concluído' && (
                                            <button 
                                                onClick={() => updateAppointmentStatus(app.id, 'Concluído')}
                                                className="text-green-600 hover:text-green-900 transition text-xs font-bold"
                                                title="Marcar como Concluído"
                                            >
                                                Concluir
                                            </button>
                                        )}
                                        <button 
                                            onClick={() => updateAppointmentStatus(app.id, 'Cancelado')}
                                            className="text-red-600 hover:text-red-900 transition text-xs"
                                            title="Cancelar Agendamento"
                                        >
                                            Cancelar
                                        </button>
                                    </td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
        </div>
    );

    const ClientsDatabase = () => (
        <div className="space-y-4">
            <h3 className="text-2xl font-bold text-pink-600 mb-4 border-b pb-2">Base de Dados de Clientes (Total: {allClients.length})</h3>
            <div className="overflow-x-auto rounded-xl shadow-2xl">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-pink-50 border-b border-pink-200 sticky top-0">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Nome</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Telefone (WhatsApp)</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Último Agendamento</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                        {allClients.map((client) => (
                            <tr key={client.id} className="hover:bg-pink-50 transition duration-150">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{client.name}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{client.phone}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {client.lastAppointment ? client.lastAppointment.toDate().toLocaleDateString(LOCALE) : 'N/A'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );

    const RevenueView = () => (
        <div className="space-y-6">
            <h3 className="text-2xl font-bold text-pink-600 mb-4 border-b pb-2">Resumo Financeiro e Estatísticas</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                
                {/* Receita Total (Concluído) */}
                <Card title="Receita Total (Líquida)" value={revenueSummary.totalRevenue} icon={<DollarSign className="w-7 h-7 text-white" />} color="bg-green-500" />
                
                {/* Receita Prevista */}
                <Card title="Receita Prevista (Bruta)" value={revenueSummary.pendingRevenue} icon={<DollarSign className="w-7 h-7 text-white" />} color="bg-yellow-500" />

                {/* Total de Agendamentos */}
                <Card title="Total de Agendamentos" value={revenueSummary.totalAppointments} icon={<ListChecks className="w-7 h-7 text-white" />} color="bg-pink-500" />
                
                {/* Agendamentos Pendentes */}
                <Card title="Agendamentos Aguardando" value={revenueSummary.pendingAppointments} icon={<Clock className="w-7 h-7 text-white" />} color="bg-blue-500" />
            </div>
            
            <h4 className="text-xl font-semibold text-gray-700 pt-8">Distribuição de Serviços Populares</h4>
            <div className="p-4 bg-white rounded-xl shadow-lg border">
                <p className="text-gray-500">Um gráfico de barras ou pizza seria ideal aqui para mostrar quais serviços (Manicure, Cílios, etc.) geram mais receita.</p>
            </div>
        </div>
    );
    
    const Card = ({ title, value, icon, color = 'bg-pink-500' }) => (
        <div className="p-5 rounded-xl shadow-xl bg-white border-t-4 border-b-4 border-pink-400">
            <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-500">{title}</p>
                <div className={`p-2 rounded-full ${color} shadow-lg`}>
                    {icon}
                </div>
            </div>
            <p className="text-3xl font-bold text-gray-900 mt-2">{value}</p>
        </div>
    );
    
    // Função para atualizar o status do agendamento
    const updateAppointmentStatus = async (appointmentId, newStatus) => {
        try {
            const appRef = doc(getPublicAppointmentsCollection(db), appointmentId);
            await setDoc(appRef, { status: newStatus }, { merge: true });
            console.log(`Status do agendamento ${appointmentId} atualizado para ${newStatus}`);
        } catch (error) {
            console.error("Erro ao atualizar status:", error);
        }
    };


    const renderContent = () => {
        switch (activeTab) {
            case 'appointments': return <AppointmentsList />;
            case 'clients': return <ClientsDatabase />;
            case 'revenue': return <RevenueView />;
            default: return <AppointmentsList />;
        }
    };
    
    const menuItems = [
        { id: 'appointments', name: 'Agendamentos', icon: ListChecks },
        { id: 'clients', name: 'Base de Clientes', icon: Users },
        { id: 'revenue', name: 'Financeiro (Ingresos)', icon: DollarSign },
    ];

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col lg:flex-row">
            {/* Sidebar para Desktop */}
            <aside className="hidden lg:block w-64 bg-white border-r shadow-2xl p-4">
                <h2 className="text-2xl font-extrabold text-pink-700 mb-10 flex items-center pt-2">
                    <Zap className="w-7 h-7 mr-2 text-pink-500" /> PAINEL INTUITIVO
                </h2>
                <nav className="space-y-2">
                    {menuItems.map(item => (
                        <button
                            key={item.id}
                            onClick={() => setActiveTab(item.id)}
                            className={`w-full flex items-center px-4 py-3 rounded-xl transition duration-150 text-left font-semibold ${
                                activeTab === item.id 
                                    ? 'bg-pink-500 text-white shadow-lg' 
                                    : 'text-gray-700 hover:bg-pink-100 hover:text-pink-600'
                            }`}
                        >
                            <item.icon className="w-5 h-5 mr-3" />
                            {item.name}
                        </button>
                    ))}
                </nav>
                <div className="mt-12 pt-4 border-t border-gray-200 text-sm text-gray-500">
                    <p className="font-bold mb-1">ID Admin:</p>
                    <p className="truncate font-mono text-xs bg-gray-100 p-2 rounded-md">{userId}</p>
                </div>
            </aside>

            {/* Header e Menu Mobile */}
            <header className="lg:hidden p-4 bg-white shadow-md flex justify-between items-center">
                <h1 className="text-xl font-bold text-pink-700">Painel Admin</h1>
                <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="text-gray-700 p-2 rounded-lg hover:bg-gray-100">
                    {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                </button>
            </header>

            {/* Menu Dropdown Mobile */}
            {isMenuOpen && (
                <div className="lg:hidden fixed inset-0 z-50 bg-white p-4 shadow-xl">
                    <div className="flex justify-end mb-4">
                        <button onClick={() => setIsMenuOpen(false)} className="text-gray-700 p-2 rounded-lg hover:bg-gray-100">
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                    <nav className="space-y-2">
                        {menuItems.map(item => (
                            <button
                                key={item.id}
                                onClick={() => { setActiveTab(item.id); setIsMenuOpen(false); }}
                                className={`w-full flex items-center px-4 py-3 rounded-xl transition duration-150 text-left font-semibold ${
                                    activeTab === item.id 
                                        ? 'bg-pink-500 text-white shadow-md' 
                                        : 'text-gray-700 hover:bg-pink-100 hover:text-pink-600'
                                }`}
                            >
                                <item.icon className="w-5 h-5 mr-3" />
                                {item.name}
                            </button>
                        ))}
                    </nav>
                </div>
            )}

            {/* Conteúdo Principal */}
            <main className="flex-1 p-4 sm:p-8 overflow-y-auto">
                {renderContent()}
            </main>
        </div>
    );
};


// --- Componente Principal da Aplicação ---
export default function App() {
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [authReady, setAuthReady] = useState(false);
    const [isDataLoading, setIsDataLoading] = useState(true);
    const [allAppointments, setAllAppointments] = useState([]);
    const [allClients, setAllClients] = useState([]);
    const [view, setView] = useState('scheduler'); // 'scheduler' ou 'admin'

    const ADMIN_FLAG_UID = userId; 

    // 1. Inicialização do Firebase e Autenticação
    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            const firestoreDb = getFirestore(app);
            const firebaseAuth = getAuth(app);
            setDb(firestoreDb);
            setAuth(firebaseAuth);

            const authenticate = async () => {
                try {
                    if (initialAuthToken) {
                        await signInWithCustomToken(firebaseAuth, initialAuthToken);
                        console.log("Autenticado com token customizado.");
                    } else {
                        await signInAnonymously(firebaseAuth);
                        console.log("Autenticado anonimamente.");
                    }
                } catch (error) {
                    console.error("Erro na autenticação:", error);
                    await signInAnonymously(firebaseAuth); 
                }
            };

            authenticate();

            // Listener de estado de autenticação
            const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
                if (user) {
                    setUserId(user.uid);
                    // Lógica simplificada de admin: o primeiro usuário autenticado é o 'admin' no nosso contexto de teste.
                    setIsAdmin(user.uid === ADMIN_FLAG_UID || ADMIN_FLAG_UID === null); 
                } else {
                    setUserId(null);
                    setIsAdmin(false);
                }
                setAuthReady(true);
            });
            
            return () => unsubscribe();

        } catch (e) {
            console.error("Erro ao inicializar Firebase:", e);
            setAuthReady(true); 
        }
    }, []);

    // 2. Fetch de Dados em Tempo Real (onSnapshot)
    useEffect(() => {
        if (!db || !authReady || !userId) {
            return;
        }

        setIsDataLoading(true);

        // Fetch de Agendamentos (Public Data)
        const qAppointments = query(getPublicAppointmentsCollection(db));
        const unsubscribeAppointments = onSnapshot(qAppointments, (snapshot) => {
            const appointments = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                date: doc.data().date, 
            }));
            setAllAppointments(appointments);
            setIsDataLoading(false);
        }, (error) => {
            console.error("Erro ao buscar agendamentos:", error);
            setIsDataLoading(false);
        });

        // Fetch de Clientes (Private Data - Admin Panel)
        let unsubscribeClients = () => {};
        if (userId) { 
             const qClients = query(getPrivateClientsCollection(db, userId));
             unsubscribeClients = onSnapshot(qClients, (snapshot) => {
                 const clients = snapshot.docs.map(doc => ({
                     id: doc.id,
                     ...doc.data(),
                 }));
                 setAllClients(clients);
             }, (error) => {
                 console.error("Erro ao buscar clientes:", error);
             });
        }
        
        return () => {
            unsubscribeAppointments();
            unsubscribeClients();
        };
    }, [db, authReady, userId]);

    // Lógica para alternar o status de Admin no carregamento
    useEffect(() => {
        if (userId) {
            // Se o primeiro usuário logado é o administrador (pelo ID)
            setIsAdmin(userId === ADMIN_FLAG_UID);
        }
    }, [userId]);


    if (!authReady || isDataLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100">
                <LoadingSpinner />
            </div>
        );
    }
    
    const adminPanelButton = (
        <button 
            onClick={() => setView(view === 'scheduler' ? 'admin' : 'scheduler')}
            className={`fixed bottom-4 ${view === 'scheduler' ? 'right-4' : 'left-4'} p-4 rounded-full shadow-2xl z-50 transition-all duration-300 ${view === 'scheduler' ? 'bg-pink-500 hover:bg-pink-600' : 'bg-gray-700 hover:bg-gray-800'} text-white flex items-center text-sm font-bold`}
            title={view === 'scheduler' ? 'Acessar Painel Administrativo' : 'Voltar ao Agendamento'}
        >
            {view === 'scheduler' ? <Users className="w-5 h-5 mr-1" /> : <ArrowLeft className="w-5 h-5 mr-1" />}
            {view === 'scheduler' ? 'Painel Admin' : 'Agendamento'}
        </button>
    );

    return (
        <div className="font-sans min-h-screen bg-gray-100 pb-20">
            {/* O botão do painel administrativo é visível para o admin */}
            {isAdmin && adminPanelButton}

            {view === 'scheduler' && (
                <div className="py-8 px-4">
                    <ClientScheduler 
                        db={db} 
                        userId={userId}
                        allAppointments={allAppointments}
                    />
                </div>
            )}
            
            {view === 'admin' && isAdmin && (
                <AdminPanel 
                    userId={userId} 
                    db={db} 
                    allAppointments={allAppointments} 
                    allClients={allClients}
                />
            )}

            {view === 'admin' && !isAdmin && (
                <div className="flex flex-col items-center justify-center min-h-screen p-4">
                    <ErrorMessage message="Acesso negado. Esta área é exclusiva para o Administrador do Estúdio." />
                </div>
            )}

        </div>
    );
}


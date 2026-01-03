'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface Job {
    id: string;
    title: string;
    description: string;
    category: string;
    urgency: string;
    complexity: string;
    requirements?: string[];
    materials?: string[];
    estimated_duration?: string;
    [key: string]: any;
}

export default function JobDetailsPage() {
    const params = useParams();
    const router = useRouter();
    const [job, setJob] = useState<Job | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchJob = async () => {
            try {
                const response = await fetch(`/api/jobs/${params.id}`);
                const data = await response.json();

                if (data.success) {
                    setJob(data.job);
                } else {
                    setError('Job not found');
                }
            } catch (err) {
                setError('Failed to load job details');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        if (params.id) {
            fetchJob();
        }
    }, [params.id]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading job details...</p>
                </div>
            </div>
        );
    }

    if (error || !job) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Job Not Found</h2>
                    <p className="text-gray-600 mb-6">{error}</p>
                    <button
                        onClick={() => router.push('/jobs')}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    >
                        Go to Job Board
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4">
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="mb-6">
                    <button
                        onClick={() => router.push('/jobs')}
                        className="flex items-center space-x-2 text-blue-600 hover:text-blue-700 mb-4 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        <span>Back to Job Board</span>
                    </button>
                    <h1 className="text-4xl font-bold text-gray-900">Job Details</h1>
                </div>

                {/* Job Overview Card */}
                <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
                    <h2 className="text-2xl font-bold text-gray-900 mb-3">{job.title}</h2>
                    <p className="text-gray-700 mb-6">{job.description}</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-blue-50 rounded-lg p-4">
                            <div className="text-sm text-blue-600 font-medium mb-1">Category</div>
                            <div className="text-lg font-semibold text-gray-900 capitalize">{job.category}</div>
                        </div>
                        <div className="bg-yellow-50 rounded-lg p-4">
                            <div className="text-sm text-yellow-600 font-medium mb-1">Urgency</div>
                            <div className="text-lg font-semibold text-gray-900 capitalize">{job.urgency}</div>
                        </div>
                        <div className="bg-purple-50 rounded-lg p-4">
                            <div className="text-sm text-purple-600 font-medium mb-1">Complexity</div>
                            <div className="text-lg font-semibold text-gray-900 capitalize">{job.complexity}</div>
                        </div>
                    </div>
                </div>

                {/* Additional Details */}
                {job.requirements && job.requirements.length > 0 && (
                    <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
                        <h3 className="text-xl font-bold text-gray-900 mb-4">Requirements</h3>
                        <ul className="space-y-2">
                            {job.requirements.map((req, index) => (
                                <li key={index} className="flex items-start space-x-2">
                                    <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    <span className="text-gray-700">{req}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {job.materials && job.materials.length > 0 && (
                    <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
                        <h3 className="text-xl font-bold text-gray-900 mb-4">Materials Needed</h3>
                        <ul className="space-y-2">
                            {job.materials.map((material, index) => (
                                <li key={index} className="flex items-start space-x-2">
                                    <svg className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                    </svg>
                                    <span className="text-gray-700">{material}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {job.estimated_duration && (
                    <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Estimated Duration</h3>
                        <p className="text-gray-700">{job.estimated_duration}</p>
                    </div>
                )}

                {/* Full JSON Data */}
                <div className="bg-white rounded-xl shadow-lg overflow-hidden">
                    <div className="bg-gray-800 p-4">
                        <h3 className="text-lg font-bold text-white">Complete Data (JSON)</h3>
                    </div>
                    <div className="p-6 bg-gray-900 overflow-x-auto">
                        <pre className="text-green-400 font-mono text-sm leading-relaxed">
                            <code>{JSON.stringify(job, null, 2)}</code>
                        </pre>
                    </div>
                </div>
            </div>
        </div>
    );
}
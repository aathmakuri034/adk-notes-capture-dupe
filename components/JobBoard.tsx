'use client';

import React, { useState, useEffect } from 'react';
import { Search, MapPin, Clock, AlertCircle, CheckCircle, Calendar, Briefcase, Code, Copy, X } from 'lucide-react';

interface JobMetadata {
  estimated_duration_minutes: number;
  urgency: string;
  location_context: string;
  job_category: string;
  problem_type: string;
  complexity: string;
  communication_preference: string;
  key_details: string[];
}

interface Job {
  id: string;
  title: string;
  summary: string;
  metadata: JobMetadata;
  created_at: string;
  conversation_turns: number;
}

const JobBoard = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filteredJobs, setFilteredJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [urgencyFilter, setUrgencyFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // JSON viewer state
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [selectedJobJson, setSelectedJobJson] = useState<string>('');
  const [jsonCopied, setJsonCopied] = useState(false);

  // Fetch jobs from API
  useEffect(() => {
    fetch('/api/jobs')
      .then(res => res.json())
      .then(data => {
        if (data.jobs) {
          setJobs(data.jobs);
          setFilteredJobs(data.jobs);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching jobs:', err);
        setError('Failed to load jobs');
        setLoading(false);
      });
  }, []);

  // Filter jobs based on search and filters
  useEffect(() => {
    let filtered = jobs;

    if (searchQuery) {
      filtered = filtered.filter(job =>
        job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.metadata.location_context.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (categoryFilter !== 'all') {
      filtered = filtered.filter(job => job.metadata.job_category === categoryFilter);
    }

    if (urgencyFilter !== 'all') {
      filtered = filtered.filter(job => job.metadata.urgency === urgencyFilter);
    }

    setFilteredJobs(filtered);
  }, [searchQuery, categoryFilter, urgencyFilter, jobs]);

  // Fetch and display JSON
  const handleViewJson = async (jobId: string) => {
    try {
      const response = await fetch(`/api/jobs/${jobId}`);
      const data = await response.json();
      
      if (data.success) {
        setSelectedJobJson(data.raw_json);
        setShowJsonModal(true);
      } else {
        console.error('Failed to fetch job JSON:', data.error);
        alert('Failed to load JSON data');
      }
    } catch (error) {
      console.error('Error fetching job JSON:', error);
      alert('Error loading JSON data');
    }
  };

  // Copy JSON to clipboard
  const handleCopyJson = () => {
    navigator.clipboard.writeText(selectedJobJson);
    setJsonCopied(true);
    setTimeout(() => setJsonCopied(false), 2000);
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency.toLowerCase()) {
      case 'emergency': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getComplexityColor = (complexity: string) => {
    switch (complexity.toLowerCase()) {
      case 'basic': return 'text-green-600';
      case 'intermediate': return 'text-yellow-600';
      case 'complex': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  const categories = ['all', ...new Set(jobs.map(j => j.metadata.job_category))];
  const urgencies = ['all', 'emergency', 'high', 'medium', 'low'];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="mx-auto text-red-600 mb-4" size={48} />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error Loading Jobs</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Job Board</h1>
              <p className="text-gray-600 mt-1">Available home improvement projects</p>
            </div>
            <div className="bg-blue-100 text-blue-800 px-4 py-2 rounded-lg font-semibold">
              {filteredJobs.length} {filteredJobs.length === 1 ? 'Job' : 'Jobs'} Available
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search and Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  placeholder="Search jobs by title, location, or description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                {categories.map(cat => (
                  <option key={cat} value={cat}>
                    {cat === 'all' ? 'All Categories' : cat}
                  </option>
                ))}
              </select>

              <select
                value={urgencyFilter}
                onChange={(e) => setUrgencyFilter(e.target.value)}
                className="px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                {urgencies.map(urg => (
                  <option key={urg} value={urg}>
                    {urg === 'all' ? 'All Urgencies' : urg.charAt(0).toUpperCase() + urg.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Job Grid */}
        {filteredJobs.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <Briefcase className="mx-auto text-gray-400 mb-4" size={48} />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No jobs found</h3>
            <p className="text-gray-600">Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredJobs.map((job) => (
              <div
                key={job.id}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-lg transition-all"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-gray-900 mb-2">{job.title}</h3>
                    <p className="text-gray-600 text-sm line-clamp-2">{job.summary}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getUrgencyColor(job.metadata.urgency)}`}>
                    {job.metadata.urgency?.toUpperCase() || 'UNKNOWN'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="flex items-center text-sm text-gray-600">
                    <MapPin size={16} className="mr-2 text-blue-600" />
                    <span>{job.metadata.location_context}</span>
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <Briefcase size={16} className="mr-2 text-purple-600" />
                    <span>{job.metadata.job_category}</span>
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <Clock size={16} className="mr-2 text-green-600" />
                    <span>{formatDuration(job.metadata.estimated_duration_minutes)}</span>
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <Calendar size={16} className="mr-2 text-orange-600" />
                    <span>{formatDate(job.created_at)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-medium">
                    {job.metadata.problem_type}
                  </span>
                  <span className={`px-3 py-1 bg-gray-100 rounded-full text-xs font-medium ${getComplexityColor(job.metadata.complexity)}`}>
                    {job.metadata.complexity}
                  </span>
                </div>

                <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs text-gray-500">Job ID: {job.id}</span>
                  <div className="flex gap-2">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewJson(job.id);
                      }}
                      className="px-3 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors text-sm font-semibold flex items-center gap-2"
                    >
                      <Code size={16} />
                      JSON
                    </button>
                    <button 
                      onClick={() => setSelectedJob(job)}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-semibold"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Job Details Modal */}
      {selectedJob && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={() => setSelectedJob(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 rounded-t-2xl">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-2">{selectedJob.title}</h2>
                  <p className="text-blue-100">{selectedJob.summary}</p>
                </div>
                <button
                  onClick={() => setSelectedJob(null)}
                  className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition-colors"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="flex items-center text-blue-600 mb-2">
                    <MapPin size={20} className="mr-2" />
                    <span className="font-semibold">Location</span>
                  </div>
                  <p className="text-gray-900 font-medium">{selectedJob.metadata.location_context}</p>
                </div>

                <div className="bg-purple-50 p-4 rounded-lg">
                  <div className="flex items-center text-purple-600 mb-2">
                    <Briefcase size={20} className="mr-2" />
                    <span className="font-semibold">Category</span>
                  </div>
                  <p className="text-gray-900 font-medium">{selectedJob.metadata.job_category}</p>
                </div>

                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="flex items-center text-green-600 mb-2">
                    <Clock size={20} className="mr-2" />
                    <span className="font-semibold">Duration</span>
                  </div>
                  <p className="text-gray-900 font-medium">{formatDuration(selectedJob.metadata.estimated_duration_minutes)}</p>
                </div>

                <div className={`p-4 rounded-lg ${getUrgencyColor(selectedJob.metadata.urgency)}`}>
                  <div className="flex items-center mb-2">
                    <AlertCircle size={20} className="mr-2" />
                    <span className="font-semibold">Urgency</span>
                  </div>
                  <p className="font-medium">{selectedJob.metadata.urgency?.toUpperCase() || 'UNKNOWN'}</p>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center">
                  <CheckCircle className="mr-2 text-green-600" size={20} />
                  Job Details
                </h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  <ul className="space-y-2">
                    {selectedJob.metadata.key_details.map((detail, idx) => (
                      <li key={idx} className="flex items-start">
                        <span className="text-blue-600 mr-2">•</span>
                        <span className="text-gray-700">{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-6 text-sm">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-gray-600 mb-1">Problem Type</div>
                  <div className="font-semibold text-gray-900">{selectedJob.metadata.problem_type}</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-gray-600 mb-1">Complexity</div>
                  <div className={`font-semibold ${getComplexityColor(selectedJob.metadata.complexity)}`}>
                    {selectedJob.metadata.complexity}
                  </div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-gray-600 mb-1">Posted</div>
                  <div className="font-semibold text-gray-900">{formatDate(selectedJob.created_at)}</div>
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => handleViewJson(selectedJob.id)}
                  className="px-6 bg-gray-800 text-white py-3 rounded-lg font-semibold hover:bg-gray-900 transition-colors flex items-center gap-2"
                >
                  <Code size={18} />
                  View JSON
                </button>
                <button className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white py-3 rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 transition-all shadow-md hover:shadow-lg">
                  Submit Bid
                </button>
                <button className="px-6 bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors">
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* JSON Viewer Modal */}
      {showJsonModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" 
          onClick={() => setShowJsonModal(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col" 
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gray-900 p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Code className="text-green-400" size={24} />
                <h2 className="text-xl font-bold text-white">Raw JSON Data</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyJson}
                  className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2"
                >
                  <Copy size={16} />
                  {jsonCopied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  onClick={() => setShowJsonModal(false)}
                  className="text-gray-400 hover:text-white transition-colors p-2"
                >
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* JSON Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
              <pre className="bg-gray-900 text-green-400 p-6 rounded-lg overflow-x-auto font-mono text-sm">
                <code>{selectedJobJson}</code>
              </pre>
            </div>

            {/* Footer */}
            <div className="bg-gray-100 p-4 border-t border-gray-200">
              <p className="text-sm text-gray-600 text-center">
                This is the raw JSON schema data stored in the system
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JobBoard;